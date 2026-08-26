import os
import rclpy
from rclpy.node import Node

from nav_msgs.msg import Odometry
from geometry_msgs.msg import Twist, TransformStamped
from sensor_msgs.msg import JointState
from tf2_ros import TransformBroadcaster

import serial
import math
import time


class ESP32OdomNode(Node):

    def __init__(self):
        super().__init__('esp32_odom')

        self.declare_parameter('port', '/dev/amr_encoder')
        self.declare_parameter('baudrate', 115200)

        self.configured_port = self.get_parameter('port').value
        self.baudrate = self.get_parameter('baudrate').value
        self.port = self.configured_port

        self.pub_odom = self.create_publisher(Odometry, '/odom', 10)
        self.joint_pub = self.create_publisher(JointState, '/joint_states', 10)

        self.create_subscription(Twist, '/cmd_vel', self.cmd_vel_callback, 10)

        self.tf_broadcaster = TransformBroadcaster(self)

        self.left_ticks = 0
        self.right_ticks = 0

        self.start_time = time.time()
        self.last_reconnect_time = 0.0
        self.ser = None

        self.connect_serial()

        self.timer = self.create_timer(0.02, self.read_serial)

    def connect_serial(self):
        candidate_ports = [
            self.configured_port,
            '/dev/amr_encoder',
            '/dev/esp',
            '/dev/esp32',
            '/dev/ttyUSB2',
            '/dev/ttyUSB1',
            '/dev/ttyUSB0',
            '/dev/ttyUSB3'
        ]
        # Remove duplicates preserving order
        ports_to_try = []
        for p in candidate_ports:
            if p and p not in ports_to_try:
                ports_to_try.append(p)

        for p in ports_to_try:
            if os.path.exists(p):
                try:
                    self.ser = serial.Serial(p, self.baudrate, timeout=0.1)
                    self.port = p
                    self.get_logger().info(f"Successfully connected to ESP32 on {p} @ {self.baudrate} baud")
                    return True
                except Exception as e:
                    self.get_logger().warn(f"Port {p} exists but open failed: {e}", throttle_duration_sec=5.0)

        self.get_logger().warn(f"ESP32 device not accessible on candidates: {ports_to_try}", throttle_duration_sec=5.0)
        return False

    def cmd_vel_callback(self, msg):
        if not self.ser or not self.ser.is_open:
            return

        try:
            packet = f"CMD,{msg.linear.x:.3f},{msg.angular.z:.3f}\n"
            self.ser.write(packet.encode())
        except Exception as e:
            self.get_logger().warn(f"TX Error: {e}", throttle_duration_sec=2.0)

    def read_serial(self):
        if time.time() - self.start_time < 1.5:
            return

        if not self.ser or not self.ser.is_open:
            if time.time() - self.last_reconnect_time > 2.0:
                self.last_reconnect_time = time.time()
                self.connect_serial()
            return

        try:
            line = self.ser.readline().decode('utf-8', errors='ignore').strip()

            if not line or not line.startswith("ODOM"):
                return

            data = line.split(',')

            if len(data) != 8:
                self.get_logger().warn(f"Bad ODOM packet: {line}", throttle_duration_sec=2.0)
                return

            x = float(data[1])
            y = float(data[2])
            theta = float(data[3])
            v = float(data[4])
            w = float(data[5])

            self.left_ticks = int(data[6])
            self.right_ticks = int(data[7])

            self.publish_odom(x, y, theta, v, w)

        except serial.SerialException as e:
            self.get_logger().warn(f"Serial connection interrupted on {self.port}: {e}. Reconnecting...", throttle_duration_sec=5.0)
            try:
                if self.ser:
                    self.ser.close()
            except Exception:
                pass
            self.ser = None
        except Exception as e:
            self.get_logger().warn(f"Serial read error: {e}", throttle_duration_sec=2.0)

    def publish_odom(self, x, y, theta, v, w):

        now = self.get_clock().now().to_msg()

        # ---------------- ODOM ----------------
        odom = Odometry()
        odom.header.stamp = now
        odom.header.frame_id = "odom"
        odom.child_frame_id = "base_link"

        odom.pose.pose.position.x = x
        odom.pose.pose.position.y = y

        odom.pose.pose.orientation.x = 0.0
        odom.pose.pose.orientation.y = 0.0
        odom.pose.pose.orientation.z = math.sin(theta / 2.0)
        odom.pose.pose.orientation.w = math.cos(theta / 2.0)

        odom.twist.twist.linear.x = v
        odom.twist.twist.angular.z = w

        self.pub_odom.publish(odom)

        # ---------------- TF ----------------
        tf_msg = TransformStamped()
        tf_msg.header.stamp = now
        tf_msg.header.frame_id = "odom"
        tf_msg.child_frame_id = "base_link"

        tf_msg.transform.translation.x = x
        tf_msg.transform.translation.y = y
        tf_msg.transform.translation.z = 0.0

        tf_msg.transform.rotation.x = 0.0
        tf_msg.transform.rotation.y = 0.0
        tf_msg.transform.rotation.z = math.sin(theta / 2.0)
        tf_msg.transform.rotation.w = math.cos(theta / 2.0)

        self.tf_broadcaster.sendTransform(tf_msg)
        self.get_logger().info("Publishing odom TF", throttle_duration_sec=5.0)

        # ---------------- JOINT STATES ----------------
        js = JointState()
        js.header.stamp = now

        js.name = ["wheel_left_joint", "wheel_right_joint"]

        js.position = [
            self.left_ticks * 0.01,
            self.right_ticks * 0.01
        ]

        self.joint_pub.publish(js)


def main(args=None):
    rclpy.init(args=args)
    node = ESP32OdomNode()
    try:
        rclpy.spin(node)
    except Exception:
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
