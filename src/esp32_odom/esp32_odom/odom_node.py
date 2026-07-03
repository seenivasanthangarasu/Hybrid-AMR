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

        self.pub_odom = self.create_publisher(Odometry, '/odom', 10)
        self.joint_pub = self.create_publisher(JointState, '/joint_states', 10)

        self.create_subscription(Twist, '/cmd_vel', self.cmd_vel_callback, 10)

        self.tf_broadcaster = TransformBroadcaster(self)

        self.left_ticks = 0
        self.right_ticks = 0

        self.start_time = time.time()

        self.timer = self.create_timer(0.02, self.read_serial)

        self.ser = None
        self.port = '/dev/esp'
        self.baudrate = 115200

        try:
            self.ser = serial.Serial(self.port, self.baudrate, timeout=0.2)
            self.get_logger().info(f"Connected to {self.port}")
        except Exception as e:
            self.get_logger().error(f"Serial connection failed: {e}")

    def cmd_vel_callback(self, msg):
        if not self.ser:
            return

        try:
            packet = f"CMD,{msg.linear.x:.3f},{msg.angular.z:.3f}\n"
            self.ser.write(packet.encode())
        except Exception as e:
            self.get_logger().warn(f"TX Error: {e}")

    def read_serial(self):
        if time.time() - self.start_time < 3.0:
            return

        if not self.ser:
            return

        try:
            line = self.ser.readline().decode('utf-8', errors='ignore').strip()

            if not line or not line.startswith("ODOM"):
                return

            data = line.split(',')

            if len(data) != 8:
                self.get_logger().warn(f"Bad ODOM packet: {line}")
                return

            x = float(data[1])
            y = float(data[2])
            theta = float(data[3])
            v = float(data[4])
            w = float(data[5])

            self.left_ticks = int(data[6])
            self.right_ticks = int(data[7])

            self.publish_odom(x, y, theta, v, w)

        except Exception as e:
            self.get_logger().warn(f"Serial read error: {e}")

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
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
