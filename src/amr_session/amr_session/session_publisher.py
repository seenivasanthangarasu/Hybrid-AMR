#!/usr/bin/env python3
"""
session_publisher.py — ROS 2 Node Publishing /amr/session

Publishes /amr/session as std_msgs/msg/String (JSON payload conforming to client contract).
- Reliability: RELIABLE
- Durability: TRANSIENT_LOCAL (depth: 1)
- Heartbeat: Immediately on startup, then EVERY 2 SECONDS while active.
- Shutdown: On SIGINT / SIGTERM / orderly exit, publishes 'ended' state before transport shutdown.
"""

import json
import signal
import sys
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy
from std_msgs.msg import String

from amr_session.session_manager import SessionManager


class SessionPublisherNode(Node):
    def __init__(self):
        super().__init__('amr_session_publisher')
        
        self.declare_parameter('session_dir', '')
        self.declare_parameter('robot_id', '')
        self.declare_parameter('publish_rate_sec', 2.0)

        session_dir = self.get_parameter('session_dir').get_parameter_value().string_value or None
        robot_id = self.get_parameter('robot_id').get_parameter_value().string_value or None
        self.publish_rate = self.get_parameter('publish_rate_sec').get_parameter_value().double_value or 2.0

        self.manager = SessionManager(session_dir=session_dir, robot_id=robot_id)
        
        # Ensure session exists or is retrieved
        self.session_data = self.manager.get_or_create_session()
        self.client_payload = self.manager.get_client_payload(self.session_data)
        
        # QoS Profile: Reliable + Transient Local for late-joiner latching
        self.qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
            history=HistoryPolicy.KEEP_LAST,
            depth=1
        )

        self.publisher = self.create_publisher(String, '/amr/session', self.qos)

        self.get_logger().info(
            f"AMR Session initialized: robot_id={self.client_payload['robot_id']}, "
            f"session_id={self.client_payload['session_id']}, "
            f"started_at={self.client_payload['started_at']}"
        )

        self._is_ended = False

        # Publish immediately on startup
        self.publish_session()

        # Publish every 2 seconds
        self.timer = self.create_timer(self.publish_rate, self.publish_session)

    def publish_session(self):
        if self._is_ended:
            return
        # Refresh client payload state
        msg = String()
        msg.data = json.dumps(self.client_payload)
        self.publisher.publish(msg)

    def publish_ended(self):
        """Publish ended state before shutdown."""
        if self._is_ended:
            return
        self._is_ended = True
        try:
            ended_data = self.manager.end_session()
            ended_payload = self.manager.get_client_payload(ended_data)
            msg = String()
            msg.data = json.dumps(ended_payload)
            self.publisher.publish(msg)
            self.get_logger().info(
                f"AMR Session ended announced for session_id={ended_payload['session_id']}"
            )
            # Give ROS transport a short window to deliver the message
            import time
            time.sleep(0.1)
        except Exception as e:
            self.get_logger().error(f"Error publishing ended session: {e}")


def main(args=None):
    rclpy.init(args=args)
    node = SessionPublisherNode()

    def handle_signal(sig, frame):
        node.get_logger().info(f"Received signal {sig}, publishing ended state...")
        node.publish_ended()
        node.destroy_node()
        rclpy.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        node.publish_ended()
        if rclpy.ok():
            node.destroy_node()
            rclpy.shutdown()


if __name__ == '__main__':
    main()
