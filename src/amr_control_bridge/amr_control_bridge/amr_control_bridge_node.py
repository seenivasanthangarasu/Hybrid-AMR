#!/usr/bin/env python3
"""
amr_control_bridge_node.py — Server-side AMR Control Operations & Workspace State Bridge.

Implements the server side of the robot control operations and workspace state bridge contract:
- Publishes /amr/session (std_msgs/msg/String) every 2.0s and immediately on startup.
- Publishes /amr/workspace/state (std_msgs/msg/String) every 1.0s (capability heartbeat, sequence, navigation_ready, etc.).
- Subscribes to /amr/workspace/request (std_msgs/msg/String) and responds with correlated acknowledgements
  on /amr/workspace/response (std_msgs/msg/String) for:
    * operation.start
    * operation.pause
    * operation.resume
    * operation.cancel
    * navigation.home
    * operation.reconcile
- Subscribes to /emergency_stop (std_msgs/msg/Bool) and zeroes /cmd_vel (geometry_msgs/msg/Twist).
- Provides legacy fallback subscription on /mission_state_cmd (std_msgs/msg/String).
"""

import json
import os
import sys
import time
import uuid

# Attempt ROS 2 imports with graceful fallback for testing environments
try:
    import rclpy
    from rclpy.node import Node
    from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy
    from std_msgs.msg import String, Bool
    from geometry_msgs.msg import Twist
except ImportError:
    rclpy = None

    class Node:
        def __init__(self, node_name):
            self._node_name = node_name
            self._params = {}

        def declare_parameter(self, name, default_value=None):
            self._params[name] = default_value

        def get_parameter(self, name):
            val = self._params.get(name)

            class _Param:
                def __init__(self, v):
                    self._v = v

                def get_parameter_value(self):
                    v = self._v

                    class _Val:
                        string_value = v if isinstance(v, str) else ""
                        bool_value = bool(v) if isinstance(v, bool) else True
                        integer_value = int(v) if isinstance(v, int) else 1
                        double_value = float(v) if isinstance(v, (int, float)) else 1.0
                    return _Val()

            return _Param(val)

        def create_publisher(self, msg_type, topic, qos):
            class _Pub:
                def __init__(self):
                    self.published = []

                def publish(self, msg):
                    self.published.append(msg)

            return _Pub()

        def create_subscription(self, msg_type, topic, callback, qos):
            return callback

        def create_timer(self, interval, callback):
            return callback

        def get_logger(self):
            import logging
            return logging.getLogger("amr_control_bridge")

        def destroy_node(self):
            pass

    class String:
        def __init__(self, data=""):
            self.data = data

    class Bool:
        def __init__(self, data=False):
            self.data = data

    class Vector3:
        def __init__(self, x=0.0, y=0.0, z=0.0):
            self.x = x
            self.y = y
            self.z = z

    class Twist:
        def __init__(self):
            self.linear = Vector3()
            self.angular = Vector3()

    class QoSProfile:
        def __init__(self, **kwargs):
            pass

    class ReliabilityPolicy:
        RELIABLE = 1

    class DurabilityPolicy:
        TRANSIENT_LOCAL = 1

    class HistoryPolicy:
        KEEP_LAST = 1


# Attempt to import authoritative SessionManager from amr_session
try:
    from amr_session.session_manager import get_session_manager, format_utc_iso8601_ms
except ImportError:
    try:
        pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "amr_session"))
        if pkg_root not in sys.path:
            sys.path.insert(0, pkg_root)
        from amr_session.session_manager import get_session_manager, format_utc_iso8601_ms
    except ImportError:
        get_session_manager = None
        format_utc_iso8601_ms = None


SUPPORTED_CAPABILITIES = [
    "operation.start",
    "operation.pause",
    "operation.resume",
    "operation.cancel",
    "navigation.home",
    "navigation.indoor",
    "navigation.outdoor",
    "operation.reconcile",
]


class AmrControlBridgeNode(Node):
    def __init__(self):
        super().__init__('amr_control_bridge_node')

        # Declare parameters
        self.declare_parameter('robot_id', '')
        self.declare_parameter('session_dir', '')
        self.declare_parameter('environment', 'indoor')
        self.declare_parameter('navigation_ready', True)
        self.declare_parameter('localization', 'localized')
        self.declare_parameter('map_id', 'map-warehouse-1')
        self.declare_parameter('map_revision', 1)
        self.declare_parameter('map_package_sha256', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
        self.declare_parameter('map_operation_id', 'act-987654')
        self.declare_parameter('state_publish_rate_sec', 1.0)
        self.declare_parameter('session_publish_rate_sec', 2.0)
        self.declare_parameter('publish_session_topic', True)

        # Retrieve parameters
        param_robot_id = self.get_parameter('robot_id').get_parameter_value().string_value
        param_session_dir = self.get_parameter('session_dir').get_parameter_value().string_value or None
        self.environment = self.get_parameter('environment').get_parameter_value().string_value or 'indoor'
        self.navigation_ready = self.get_parameter('navigation_ready').get_parameter_value().bool_value
        self.localization = self.get_parameter('localization').get_parameter_value().string_value or 'localized'
        self.map_id = self.get_parameter('map_id').get_parameter_value().string_value or 'map-warehouse-1'
        self.map_revision = self.get_parameter('map_revision').get_parameter_value().integer_value or 1
        self.map_package_sha256 = self.get_parameter('map_package_sha256').get_parameter_value().string_value or 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        self.map_operation_id = self.get_parameter('map_operation_id').get_parameter_value().string_value or 'act-987654'
        self.state_rate = self.get_parameter('state_publish_rate_sec').get_parameter_value().double_value or 1.0
        self.session_rate = self.get_parameter('session_publish_rate_sec').get_parameter_value().double_value or 2.0
        self.enable_session_pub = self.get_parameter('publish_session_topic').get_parameter_value().bool_value

        # Initialize Authoritative Session
        session_initialized = False
        if get_session_manager is not None:
            try:
                self.session_manager = get_session_manager(session_dir=param_session_dir, robot_id=param_robot_id or None)
                session_data = self.session_manager.get_or_create_session()
                self.robot_id = session_data.get("robot_id", "amr-1")
                self.session_id = session_data.get("session_id", str(uuid.uuid4()))
                self.started_at = session_data.get("started_at", time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()))
                session_initialized = True
            except Exception as e:
                self.get_logger().warning(f"Could not initialize SessionManager: {e}, falling back to generated session.")

        if not session_initialized:
            self.session_manager = None
            self.robot_id = param_robot_id if param_robot_id else "amr-1"
            self.session_id = str(uuid.uuid4())
            if format_utc_iso8601_ms:
                self.started_at = format_utc_iso8601_ms(time.time())
            else:
                self.started_at = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())

        # State Variables
        self.sequence = 0
        self.operation_state = "idle"  # idle | running | paused | canceling
        self.is_emergency_stopped = False
        self.reconciled_request_ids = []

        # QoS Profiles
        self.qos_reliable = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=10
        )
        self.qos_transient = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
            history=HistoryPolicy.KEEP_LAST,
            depth=1
        )

        # Publishers
        self.session_pub = self.create_publisher(String, '/amr/session', self.qos_reliable)
        self.state_pub = self.create_publisher(String, '/amr/workspace/state', self.qos_reliable)
        self.response_pub = self.create_publisher(String, '/amr/workspace/response', self.qos_reliable)
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)

        # Subscribers
        self.request_sub = self.create_subscription(
            String, '/amr/workspace/request', self.on_workspace_request, self.qos_reliable
        )
        self.estop_sub = self.create_subscription(
            Bool, '/emergency_stop', self.on_emergency_stop, self.qos_reliable
        )
        self.mission_state_sub = self.create_subscription(
            String, '/mission_state_cmd', self.on_legacy_mission_cmd, 10
        )

        # Timers
        if self.enable_session_pub:
            self.publish_session()
            self.session_timer = self.create_timer(self.session_rate, self.publish_session)
        else:
            self.session_timer = None

        self.publish_workspace_state()
        self.state_timer = self.create_timer(self.state_rate, self.publish_workspace_state)

        self.get_logger().info(
            f"AMR Control Bridge online. Robot: '{self.robot_id}', "
            f"Session ID: '{self.session_id}', Started at: '{self.started_at}'"
        )

    def publish_session(self):
        """Broadcast authoritative session metadata on /amr/session."""
        msg = String()
        msg.data = json.dumps({
            "schema_version": 1,
            "robot_id": self.robot_id,
            "session_id": self.session_id,
            "started_at": self.started_at,
            "state": "active"
        })
        self.session_pub.publish(msg)

    def publish_workspace_state(self):
        """Broadcast live workspace state and capability heartbeat on /amr/workspace/state."""
        self.sequence += 1
        payload = {
            "schema_version": 1,
            "robot_id": self.robot_id,
            "session_id": self.session_id,
            "sequence": self.sequence,
            "environment": self.environment,
            "capabilities": list(SUPPORTED_CAPABILITIES),
            "operation": {
                "state": self.operation_state
            },
            "navigation_ready": bool(self.navigation_ready and not self.is_emergency_stopped),
            "localization": self.localization,
            "active_map": {
                "map_id": self.map_id,
                "revision": self.map_revision,
                "package_sha256": self.map_package_sha256,
                "operation_id": self.map_operation_id
            },
            "reconciled_request_ids": list(self.reconciled_request_ids)
        }
        msg = String()
        msg.data = json.dumps(payload)
        self.state_pub.publish(msg)

    def record_reconciled(self, request_id):
        """Track completed/acknowledged request IDs for state synchronization."""
        if request_id and request_id not in self.reconciled_request_ids:
            self.reconciled_request_ids.append(request_id)
            if len(self.reconciled_request_ids) > 50:
                self.reconciled_request_ids.pop(0)

    def on_workspace_request(self, msg: String):
        """Handle incoming RPC requests on /amr/workspace/request."""
        try:
            req = json.loads(msg.data)
        except Exception as e:
            self.get_logger().error(f"Malformed JSON in workspace request: {e}")
            return

        req_id = req.get("request_id")
        client_id = req.get("client_id")
        op = req.get("op")
        req_session = req.get("session_id")

        self.get_logger().info(
            f"Received RPC request: op='{op}' request_id='{req_id}' client_id='{client_id}'"
        )

        if not op:
            self.send_response(client_id, req_id, op or "unknown", ok=False, error="Missing 'op' field in request.")
            return

        # Informational log if request session does not match authoritative session
        if req_session and req_session != self.session_id:
            self.get_logger().warning(
                f"Request session_id '{req_session}' does not match server session_id '{self.session_id}'"
            )

        # Emergency stop check
        if self.is_emergency_stopped and op != "operation.cancel":
            self.send_response(
                client_id, req_id, op, ok=False,
                error="Robot is in Emergency Stop state. Clear emergency stop or cancel operation."
            )
            return

        # Dispatch operations
        if op == "operation.start":
            if not self.navigation_ready or self.is_emergency_stopped:
                self.send_response(client_id, req_id, op, ok=False, error="Navigation stack is not ready.")
                return
            self.operation_state = "running"
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True})
            self.publish_workspace_state()

        elif op == "operation.pause":
            self.operation_state = "paused"
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True})
            self.publish_workspace_state()

        elif op == "operation.resume":
            if not self.navigation_ready or self.is_emergency_stopped:
                self.send_response(client_id, req_id, op, ok=False, error="Navigation stack is not ready.")
                return
            self.operation_state = "running"
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True})
            self.publish_workspace_state()

        elif op == "operation.cancel":
            self.operation_state = "idle"
            # Cancel active navigation and send zero velocity
            zero_twist = Twist()
            self.cmd_vel_pub.publish(zero_twist)
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True})
            self.publish_workspace_state()

        elif op == "navigation.home":
            if not self.navigation_ready or self.is_emergency_stopped:
                self.send_response(client_id, req_id, op, ok=False, error="Navigation stack is not ready.")
                return
            self.operation_state = "running"
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True})
            self.publish_workspace_state()

        elif op == "operation.reconcile":
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True, "reconciled": True})
            self.publish_workspace_state()

        elif op in ["navigation.indoor", "navigation.outdoor"]:
            target_env = "indoor" if op == "navigation.indoor" else "outdoor"
            self.environment = target_env
            self.record_reconciled(req_id)
            self.send_response(client_id, req_id, op, ok=True, result={"acknowledged": True, "environment": self.environment})
            self.publish_workspace_state()

        else:
            self.send_response(client_id, req_id, op, ok=False, error=f"Unsupported operation: {op}")

    def send_response(self, client_id, request_id, op, ok=True, result=None, error=None):
        """Publish correlated RPC response envelope on /amr/workspace/response."""
        payload = {
            "schema_version": 1,
            "client_id": client_id or "",
            "robot_id": self.robot_id,
            "session_id": self.session_id,
            "request_id": request_id or "",
            "op": op,
            "ok": ok
        }
        if ok:
            payload["result"] = result if result is not None else {"acknowledged": True}
        else:
            payload["error"] = error or "Operation failed"

        res_msg = String()
        res_msg.data = json.dumps(payload)
        self.response_pub.publish(res_msg)
        self.get_logger().info(
            f"Dispatched RPC response: op='{op}' request_id='{request_id}' ok={ok}"
        )

    def on_emergency_stop(self, msg: Bool):
        """Handle emergency stop triggers from /emergency_stop."""
        self.is_emergency_stopped = bool(msg.data)
        if self.is_emergency_stopped:
            self.get_logger().warning("🚨 EMERGENCY STOP TRIGGERED ON /emergency_stop!")
            self.operation_state = "idle"
            zero_twist = Twist()
            self.cmd_vel_pub.publish(zero_twist)
        else:
            self.get_logger().info("✅ Emergency stop cleared.")
        self.publish_workspace_state()

    def on_legacy_mission_cmd(self, msg: String):
        """Backwards compatibility handler for legacy /mission_state_cmd."""
        cmd = msg.data.strip().upper()
        self.get_logger().info(f"Received legacy /mission_state_cmd: '{cmd}'")
        if cmd == "START":
            if self.navigation_ready and not self.is_emergency_stopped:
                self.operation_state = "running"
        elif cmd == "PAUSE":
            if not self.is_emergency_stopped:
                self.operation_state = "paused"
        elif cmd == "RESUME":
            if self.navigation_ready and not self.is_emergency_stopped:
                self.operation_state = "running"
        elif cmd == "STOP":
            self.operation_state = "idle"
            self.cmd_vel_pub.publish(Twist())
        self.publish_workspace_state()


def main(args=None):
    if rclpy is None:
        raise RuntimeError("rclpy is not installed or ROS 2 is not sourced.")
    rclpy.init(args=args)
    node = AmrControlBridgeNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        if rclpy.ok():
            node.destroy_node()
            rclpy.shutdown()


if __name__ == '__main__':
    main()
