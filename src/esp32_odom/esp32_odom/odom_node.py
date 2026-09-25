#!/usr/bin/env python3
# ==============================================================================
# ESP32 Tracked AMR Odometry Node (ROS 2 Jazzy)
# Asynchronous Background Serial Reader + High-Rate (50 Hz) Continuous TF & Odom
# ==============================================================================

import os
import time
import math
import re
import threading
import serial

import rclpy
from rclpy.node import Node

from nav_msgs.msg import Odometry
from geometry_msgs.msg import TransformStamped
from sensor_msgs.msg import JointState
from tf2_ros import TransformBroadcaster


class ESP32OdomNode(Node):

    def __init__(self):
        super().__init__('esp32_odom')

        # ----------------------------------------------------------------------
        # ROS 2 Parameters Declaration
        # ----------------------------------------------------------------------
        self.declare_parameter('port', '/dev/ttyACM1')
        self.declare_parameter('baud_rate', 115200)
        self.declare_parameter('baudrate', 115200)
        self.declare_parameter('timeout', 0.1)

        # Empirical calibration values (measured on physical 3m tracked straight-line test)
        self.declare_parameter('left_counts_per_meter', 20817.0)
        self.declare_parameter('right_counts_per_meter', 21031.0)

        # Direction Normalization (Forward motion must produce positive displacement)
        self.declare_parameter('left_encoder_inverted', False)
        self.declare_parameter('right_encoder_inverted', True)

        # Track geometry (meters)
        self.declare_parameter('effective_track_separation', 0.363)
        self.declare_parameter('physical_track_center_distance', 0.40)
        self.declare_parameter('track_loop_length', 1.22)

        # Frames & TF
        self.declare_parameter('odom_frame', 'odom')
        self.declare_parameter('base_frame', 'base_link')
        self.declare_parameter('publish_tf', True)
        self.declare_parameter('publish_joint_states', True)
        self.declare_parameter('publish_rate_hz', 50.0)

        # Reset & Jump Threshold
        self.declare_parameter('reset_jump_threshold', 50000)

        # ----------------------------------------------------------------------
        # Fetch Parameter Values
        # ----------------------------------------------------------------------
        self.configured_port = self.get_parameter('port').value
        baud_param = self.get_parameter('baud_rate').value
        if baud_param is None or baud_param == 115200:
            baud_param = self.get_parameter('baudrate').value
        self.baudrate = baud_param
        self.serial_timeout = float(self.get_parameter('timeout').value)

        self.left_cpm = float(self.get_parameter('left_counts_per_meter').value)
        self.right_cpm = float(self.get_parameter('right_counts_per_meter').value)

        self.left_inverted = bool(self.get_parameter('left_encoder_inverted').value)
        self.right_inverted = bool(self.get_parameter('right_encoder_inverted').value)

        self.effective_track_sep = float(self.get_parameter('effective_track_separation').value)
        self.physical_track_dist = float(self.get_parameter('physical_track_center_distance').value)
        self.track_loop_length = float(self.get_parameter('track_loop_length').value)

        self.odom_frame = str(self.get_parameter('odom_frame').value)
        self.base_frame = str(self.get_parameter('base_frame').value)
        self.publish_tf = bool(self.get_parameter('publish_tf').value)
        self.publish_joint_states = bool(self.get_parameter('publish_joint_states').value)
        self.pub_rate = float(self.get_parameter('publish_rate_hz').value)

        self.reset_jump_threshold = int(self.get_parameter('reset_jump_threshold').value)

        self.get_logger().info(
            f"Initializing ESP32 Odom (Target Port: {self.configured_port} @ {self.baudrate} baud)\n"
            f"Calibration: Left CPM={self.left_cpm:.1f}, Right CPM={self.right_cpm:.1f} | "
            f"Effective Separation={self.effective_track_sep:.3f}m | Inverted: [L={self.left_inverted}, R={self.right_inverted}]"
        )

        # ----------------------------------------------------------------------
        # ROS 2 Publishers
        # ----------------------------------------------------------------------
        self.pub_odom = self.create_publisher(Odometry, '/odom', 10)
        self.joint_pub = self.create_publisher(JointState, '/joint_states', 10)
        self.tf_broadcaster = TransformBroadcaster(self)

        # ----------------------------------------------------------------------
        # State Variables & Lock
        # ----------------------------------------------------------------------
        self.lock = threading.Lock()

        self.x = 0.0
        self.y = 0.0
        self.yaw = 0.0
        self.linear_v = 0.0
        self.angular_w = 0.0

        self.prev_left_ticks = None
        self.prev_right_ticks = None
        self.prev_esp_timestamp_ms = None
        self.prev_update_time = None

        self.norm_left_count = 0
        self.norm_right_count = 0

        self.legacy_pattern = re.compile(r'LEFT\s*=\s*([+-]?\d+)\s+RIGHT\s*=\s*([+-]?\d+)', re.IGNORECASE)

        # ----------------------------------------------------------------------
        # Background Serial Reader Thread
        # ----------------------------------------------------------------------
        self.running = True
        self.ser = None
        self.port = self.configured_port

        self.serial_thread = threading.Thread(target=self._serial_worker, daemon=True)
        self.serial_thread.start()

        # ----------------------------------------------------------------------
        # High-Rate (50 Hz) Periodic Publish Timer
        # ----------------------------------------------------------------------
        timer_period = 1.0 / max(1.0, self.pub_rate)
        self.last_pub_time = time.time()
        self.pub_timer = self.create_timer(timer_period, self._publish_timer_callback)

    def _connect_serial(self):
        """Attempts connection to configured port and candidate serial devices."""
        candidate_ports = [
            self.configured_port,
            '/dev/ttyACM1',
            '/dev/amr_encoder',
            '/dev/esp32',
            '/dev/esp',
            '/dev/ttyUSB2',
            '/dev/ttyUSB1',
            '/dev/ttyUSB0',
            '/dev/ttyACM0',
            '/dev/ttyACM2',
        ]
        ports_to_try = []
        for p in candidate_ports:
            if p and p not in ports_to_try and os.path.exists(p):
                ports_to_try.append(p)

        for p in ports_to_try:
            try:
                ser = serial.Serial(
                    port=p,
                    baudrate=self.baudrate,
                    timeout=0.2,
                    write_timeout=0.5
                )
                self.port = p
                self.get_logger().info(f"Successfully connected to ESP32 encoder on {p} @ {self.baudrate} baud")
                return ser
            except Exception as e:
                self.get_logger().warn(f"Candidate serial port {p} open failed: {e}", throttle_duration_sec=5.0)

        self.get_logger().warn(
            f"No accessible ESP32 serial port found among candidates: {ports_to_try}",
            throttle_duration_sec=5.0
        )
        return None

    def _serial_worker(self):
        """Dedicated background thread reading serial stream continuously."""
        while self.running and rclpy.ok():
            if not self.ser or not self.ser.is_open:
                self.ser = self._connect_serial()
                if not self.ser:
                    time.sleep(1.0)
                    continue

            try:
                raw_bytes = self.ser.readline()
                if not raw_bytes:
                    continue

                line = raw_bytes.decode('utf-8', errors='ignore').strip()
                if not line or line.startswith('#'):
                    continue

                self._parse_telemetry_line(line)

            except serial.SerialException as e:
                self.get_logger().warn(
                    f"ESP32 serial connection error on {self.port}: {e}. Reconnecting...",
                    throttle_duration_sec=5.0
                )
                try:
                    if self.ser:
                        self.ser.close()
                except Exception:
                    pass
                self.ser = None
                time.sleep(1.0)
            except Exception as e:
                self.get_logger().warn(f"Serial worker read error: {e}", throttle_duration_sec=2.0)
                time.sleep(0.01)

    def _parse_telemetry_line(self, line: str):
        """Parses machine-readable packet or legacy format lines."""
        raw_left = None
        raw_right = None
        esp_ts_ms = None

        # 1. Standard Protocol: ENC,<timestamp_ms>,<left_count>,<right_count>
        if line.startswith("ENC"):
            tokens = line.split(',')
            if len(tokens) >= 4:
                try:
                    esp_ts_ms = int(tokens[1])
                    raw_left = int(tokens[2])
                    raw_right = int(tokens[3])
                except ValueError:
                    return
            else:
                return

        # 2. Legacy ODOM Protocol: ODOM,x,y,theta,v,w,left,right
        elif line.startswith("ODOM"):
            tokens = line.split(',')
            if len(tokens) >= 8:
                try:
                    raw_left = int(tokens[6])
                    raw_right = int(tokens[7])
                except ValueError:
                    return
            else:
                return

        # 3. Legacy Text Format: LEFT = <count>    RIGHT = <count>
        elif "LEFT" in line and "RIGHT" in line:
            match = self.legacy_pattern.search(line)
            if match:
                try:
                    raw_left = int(match.group(1))
                    raw_right = int(match.group(2))
                except ValueError:
                    return
            else:
                return
        else:
            return

        if raw_left is not None and raw_right is not None:
            self._update_kinematics(raw_left, raw_right, esp_ts_ms)

    def _update_kinematics(self, raw_left: int, raw_right: int, esp_ts_ms: int = None):
        """Processes encoder ticks and computes exact circular arc delta."""
        now_time_sec = time.time()

        sign_l = -1 if self.left_inverted else 1
        sign_r = -1 if self.right_inverted else 1

        norm_left = raw_left * sign_l
        norm_right = raw_right * sign_r

        with self.lock:
            self.norm_left_count = norm_left
            self.norm_right_count = norm_right

            if self.prev_left_ticks is None or self.prev_right_ticks is None:
                self.prev_left_ticks = norm_left
                self.prev_right_ticks = norm_right
                self.prev_esp_timestamp_ms = esp_ts_ms
                self.prev_update_time = now_time_sec
                return

            delta_left = norm_left - self.prev_left_ticks
            delta_right = norm_right - self.prev_right_ticks

            # Time delta calculation
            dt = 0.0
            if esp_ts_ms is not None and self.prev_esp_timestamp_ms is not None:
                delta_ms = esp_ts_ms - self.prev_esp_timestamp_ms
                if 0 < delta_ms < 2000:
                    dt = delta_ms / 1000.0

            if dt <= 0.0 or dt > 1.0:
                dt = now_time_sec - (self.prev_update_time or now_time_sec)
                if dt <= 0.0 or dt > 1.0:
                    dt = 0.02

            # Reset / Jump Detection
            if (abs(delta_left) > self.reset_jump_threshold or
                    abs(delta_right) > self.reset_jump_threshold or
                    (esp_ts_ms is not None and self.prev_esp_timestamp_ms is not None and esp_ts_ms < self.prev_esp_timestamp_ms)):
                self.get_logger().warn(
                    f"Encoder reset/jump detected (dL={delta_left}, dR={delta_right}). Re-anchoring.",
                    throttle_duration_sec=2.0
                )
                self.prev_left_ticks = norm_left
                self.prev_right_ticks = norm_right
                self.prev_esp_timestamp_ms = esp_ts_ms
                self.prev_update_time = now_time_sec
                self.linear_v = 0.0
                self.angular_w = 0.0
                return

            self.prev_left_ticks = norm_left
            self.prev_right_ticks = norm_right
            self.prev_esp_timestamp_ms = esp_ts_ms
            self.prev_update_time = now_time_sec

            # Track distance increments (meters)
            d_left = delta_left / self.left_cpm
            d_right = delta_right / self.right_cpm

            d_center = (d_left + d_right) / 2.0
            d_theta = (d_right - d_left) / self.effective_track_sep

            # Exact circular arc / Runge-Kutta 2 integration
            if abs(d_theta) < 1e-6:
                dx = d_center * math.cos(self.yaw + d_theta * 0.5)
                dy = d_center * math.sin(self.yaw + d_theta * 0.5)
            else:
                radius = d_center / d_theta
                dx = radius * (math.sin(self.yaw + d_theta) - math.sin(self.yaw))
                dy = radius * (-math.cos(self.yaw + d_theta) + math.cos(self.yaw))

            self.x += dx
            self.y += dy
            self.yaw += d_theta
            self.yaw = math.atan2(math.sin(self.yaw), math.cos(self.yaw))

            if dt > 0.0:
                self.linear_v = d_center / dt
                self.angular_w = d_theta / dt
            else:
                self.linear_v = 0.0
                self.angular_w = 0.0

    def _publish_timer_callback(self):
        """High-frequency continuous publisher (50 Hz)."""
        now_time = time.time()
        stamp = self.get_clock().now().to_msg()

        with self.lock:
            x = self.x
            y = self.y
            yaw = self.yaw
            v = self.linear_v
            w = self.angular_w
            left_count = self.norm_left_count
            right_count = self.norm_right_count

        half_yaw = yaw * 0.5
        qz = math.sin(half_yaw)
        qw = math.cos(half_yaw)

        # ----------------------------------------------------------------------
        # 1. nav_msgs/msg/Odometry -> /odom (50 Hz)
        # ----------------------------------------------------------------------
        odom = Odometry()
        odom.header.stamp = stamp
        odom.header.frame_id = self.odom_frame
        odom.child_frame_id = self.base_frame

        odom.pose.pose.position.x = float(x)
        odom.pose.pose.position.y = float(y)
        odom.pose.pose.position.z = 0.0

        odom.pose.pose.orientation.x = 0.0
        odom.pose.pose.orientation.y = 0.0
        odom.pose.pose.orientation.z = qz
        odom.pose.pose.orientation.w = qw

        odom.pose.covariance = [
            1e-3, 0.0,  0.0,  0.0,  0.0,  0.0,
            0.0,  1e-3, 0.0,  0.0,  0.0,  0.0,
            0.0,  0.0,  1e6,  0.0,  0.0,  0.0,
            0.0,  0.0,  0.0,  1e6,  0.0,  0.0,
            0.0,  0.0,  0.0,  0.0,  1e6,  0.0,
            0.0,  0.0,  0.0,  0.0,  0.0,  1e-2
        ]

        odom.twist.twist.linear.x = float(v)
        odom.twist.twist.linear.y = 0.0
        odom.twist.twist.linear.z = 0.0

        odom.twist.twist.angular.x = 0.0
        odom.twist.twist.angular.y = 0.0
        odom.twist.twist.angular.z = float(w)

        odom.twist.covariance = [
            1e-3, 0.0,  0.0,  0.0,  0.0,  0.0,
            0.0,  1e-3, 0.0,  0.0,  0.0,  0.0,
            0.0,  0.0,  1e6,  0.0,  0.0,  0.0,
            0.0,  0.0,  0.0,  1e6,  0.0,  0.0,
            0.0,  0.0,  0.0,  0.0,  1e6,  0.0,
            0.0,  0.0,  0.0,  0.0,  0.0,  1e-2
        ]

        self.pub_odom.publish(odom)

        # ----------------------------------------------------------------------
        # 2. Continuous TF: odom -> base_link (50 Hz)
        # ----------------------------------------------------------------------
        if self.publish_tf:
            tf_msg = TransformStamped()
            tf_msg.header.stamp = stamp
            tf_msg.header.frame_id = self.odom_frame
            tf_msg.child_frame_id = self.base_frame

            tf_msg.transform.translation.x = float(x)
            tf_msg.transform.translation.y = float(y)
            tf_msg.transform.translation.z = 0.0

            tf_msg.transform.rotation.x = 0.0
            tf_msg.transform.rotation.y = 0.0
            tf_msg.transform.rotation.z = qz
            tf_msg.transform.rotation.w = qw

            self.tf_broadcaster.sendTransform(tf_msg)

        # ----------------------------------------------------------------------
        # 3. sensor_msgs/msg/JointState -> /joint_states (50 Hz)
        # ----------------------------------------------------------------------
        if self.publish_joint_states:
            js = JointState()
            js.header.stamp = stamp
            js.name = ["wheel_left_joint", "wheel_right_joint"]
            js.position = [
                float(left_count) / self.left_cpm,
                float(right_count) / self.right_cpm
            ]
            self.joint_pub.publish(js)

    def destroy_node(self):
        """Cleanup serial resources on shutdown."""
        self.running = False
        if hasattr(self, 'ser') and self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = ESP32OdomNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        try:
            node.destroy_node()
        except Exception:
            pass
        if rclpy.ok():
            try:
                rclpy.shutdown()
            except Exception:
                pass


if __name__ == '__main__':
    main()
