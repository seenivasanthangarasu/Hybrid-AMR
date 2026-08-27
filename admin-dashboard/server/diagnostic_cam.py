#!/usr/bin/env python3
"""
diagnostic_cam.py — Pro-Max AMR Diagnostic HUD Camera Streamer
Publishes a real-time synthetic HUD telemetry stream to /camera/color/image_raw
and /camera/camera/color/image_raw when physical optical hardware is offline or
in diagnostic mode.
"""
import os
import sys
import time
import math
import cv2
import numpy as np
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
from sensor_msgs.msg import Image, NavSatFix, Imu
from nav_msgs.msg import Odometry
from cv_bridge import CvBridge

class DiagnosticCamNode(Node):
    def __init__(self):
        super().__init__('diagnostic_camera_node')
        self.bridge = CvBridge()
        
        # State telemetry cache
        self.odom_pos = [0.0, 0.0]
        self.odom_vel = [0.0, 0.0]
        self.last_odom_time = 0.0
        
        self.imu_rpy = [0.0, 0.0, 0.0]
        self.last_imu_time = 0.0
        
        self.gps_coords = [0.0, 0.0, 0.0]
        self.gps_status = -1
        self.last_gps_time = 0.0

        self.start_time = time.time()
        self.frame_count = 0

        qos_sub = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        qos_pub = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        # Subscriptions to robot telemetry
        self.create_subscription(Odometry, '/odom', self.odom_cb, qos_sub)
        self.create_subscription(Imu, '/hiwonder/imu/data_raw', self.imu_cb, qos_sub)
        self.create_subscription(NavSatFix, '/hiwonder/gps/fix', self.gps_cb, qos_sub)

        # Publishers for web_video_server
        self.pub_cam1 = self.create_publisher(Image, '/camera/color/image_raw', qos_pub)
        self.pub_cam2 = self.create_publisher(Image, '/camera/camera/color/image_raw', qos_pub)

        # 15 FPS timer
        self.timer = self.create_timer(0.066, self.render_and_publish_frame)
        self.get_logger().info('Pro-Max Diagnostic HUD Camera Node running @ 15 FPS')

    def odom_cb(self, msg: Odometry):
        self.odom_pos = [msg.pose.pose.position.x, msg.pose.pose.position.y]
        self.odom_vel = [msg.twist.twist.linear.x, msg.twist.twist.angular.z]
        self.last_odom_time = time.time()

    def imu_cb(self, msg: Imu):
        q = msg.orientation
        sinr_cosp = 2 * (q.w * q.x + q.y * q.z)
        cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y)
        roll = math.atan2(sinr_cosp, cosr_cosp)

        sinp = 2 * (q.w * q.y - q.z * q.x)
        pitch = math.asin(sinp) if abs(sinp) <= 1 else math.copysign(math.pi / 2, sinp)

        siny_cosp = 2 * (q.w * q.z + q.x * q.y)
        cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
        yaw = math.atan2(siny_cosp, cosy_cosp)

        self.imu_rpy = [math.degrees(roll), math.degrees(pitch), math.degrees(yaw)]
        self.last_imu_time = time.time()

    def gps_cb(self, msg: NavSatFix):
        self.gps_coords = [msg.latitude, msg.longitude, msg.altitude]
        self.gps_status = msg.status.status
        self.last_gps_time = time.time()

    def render_and_publish_frame(self):
        now = time.time()
        self.frame_count += 1
        elapsed = now - self.start_time

        # Canvas: 640x360 dark cybernetic slate
        w, h = 640, 360
        img = np.full((h, w, 3), (15, 18, 24), dtype=np.uint8)

        # Draw subtle background grid
        grid_color = (25, 32, 42)
        for gx in range(0, w, 40):
            cv2.line(img, (gx, 0), (gx, h), grid_color, 1)
        for gy in range(0, h, 40):
            cv2.line(img, (0, gy), (w, gy), grid_color, 1)

        # Top Header Bar
        cv2.rectangle(img, (0, 0), (w, 38), (22, 27, 36), -1)
        cv2.line(img, (0, 38), (w, 38), (0, 200, 255), 1)

        # Title and Badge
        cv2.putText(img, "HYBRID-AMR PRO-MAX VISION HUD", (14, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 255), 2, cv2.LINE_AA)
        
        # Mode badge
        cv2.rectangle(img, (w - 180, 8), (w - 12, 30), (45, 30, 15), -1)
        cv2.rectangle(img, (w - 180, 8), (w - 12, 30), (0, 165, 255), 1)
        cv2.putText(img, "DIAGNOSTIC STREAM", (w - 172, 23),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 200, 255), 1, cv2.LINE_AA)

        # Central Radar / Reticle
        cx, cy = w // 2, (h // 2) + 10
        cv2.circle(img, (cx, cy), 70, (40, 50, 65), 1)
        cv2.circle(img, (cx, cy), 45, (30, 42, 55), 1)
        cv2.circle(img, (cx, cy), 20, (25, 35, 48), 1)
        
        # Rotating Radar Sweep line
        angle = (elapsed * 2.0) % (2 * math.pi)
        rx = int(cx + 70 * math.cos(angle))
        ry = int(cy + 70 * math.sin(angle))
        cv2.line(img, (cx, cy), (rx, ry), (0, 255, 180), 1, cv2.LINE_AA)
        
        # Reticle Crosshairs
        cv2.line(img, (cx - 85, cy), (cx - 15, cy), (0, 200, 255), 1)
        cv2.line(img, (cx + 15, cy), (cx + 85, cy), (0, 200, 255), 1)
        cv2.line(img, (cx, cy - 85), (cx, cy - 15), (0, 200, 255), 1)
        cv2.line(img, (cx, cy + 15), (cx, cy + 85), (0, 200, 255), 1)

        # Left Info Box: Sensor Pipeline Status
        cv2.rectangle(img, (14, 52), (180, 210), (20, 26, 35), -1)
        cv2.rectangle(img, (14, 52), (180, 210), (45, 55, 75), 1)
        cv2.putText(img, "HARDWARE PIPELINE", (22, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (120, 180, 255), 1, cv2.LINE_AA)

        odom_live = (now - self.last_odom_time) < 1.0
        imu_live = (now - self.last_imu_time) < 1.0
        gps_live = (now - self.last_gps_time) < 3.0

        sensors = [
            ("ESP32 Odom", odom_live),
            ("YDLIDAR G2B", True),
            ("Hiwonder IMU", imu_live),
            ("Hiwonder GPS", gps_live),
            ("RealSense Cam", False),
        ]
        
        sy = 92
        for sname, slive in sensors:
            dot_color = (80, 230, 100) if slive else (80, 80, 240)
            cv2.circle(img, (26, sy - 4), 4, dot_color, -1)
            cv2.putText(img, sname, (36, sy), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (200, 210, 220), 1, cv2.LINE_AA)
            status_txt = "LIVE" if slive else "OFFLINE"
            status_col = (80, 230, 100) if slive else (120, 120, 160)
            cv2.putText(img, status_txt, (125, sy), cv2.FONT_HERSHEY_SIMPLEX, 0.32, status_col, 1, cv2.LINE_AA)
            sy += 23

        # Right Info Box: Live Telemetry
        cv2.rectangle(img, (w - 194, 52), (w - 14, 210), (20, 26, 35), -1)
        cv2.rectangle(img, (w - 194, 52), (w - 14, 210), (45, 55, 75), 1)
        cv2.putText(img, "TELEMETRY READOUT", (w - 186, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (120, 180, 255), 1, cv2.LINE_AA)

        ty = 92
        tlines = [
            f"X: {self.odom_pos[0]:+.2f} m",
            f"Y: {self.odom_pos[1]:+.2f} m",
            f"Lin V: {self.odom_vel[0]:+.2f} m/s",
            f"Ang W: {self.odom_vel[1]:+.2f} r/s",
            f"Yaw: {self.imu_rpy[2]:+.1f} deg",
        ]
        for tline in tlines:
            cv2.putText(img, tline, (w - 186, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 220, 255), 1, cv2.LINE_AA)
            ty += 23

        # Bottom Diagnostic Banner
        cv2.rectangle(img, (0, h - 34), (w, h), (18, 22, 30), -1)
        cv2.line(img, (0, h - 34), (w, h - 34), (45, 55, 75), 1)

        banner_text = "STATUS: NO OPTICAL USB CAM CONNECTED | PLUG IN REALSENSE / USB CAM FOR DIRECT OPTICAL FEED"
        cv2.putText(img, banner_text, (12, h - 13),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.30, (160, 175, 190), 1, cv2.LINE_AA)

        # Convert to ROS Image message and publish
        out_msg = self.bridge.cv2_to_imgmsg(img, encoding='bgr8')
        out_msg.header.stamp = self.get_clock().now().to_msg()
        out_msg.header.frame_id = 'camera_link'

        self.pub_cam1.publish(out_msg)
        self.pub_cam2.publish(out_msg)

def main():
    rclpy.init()
    node = DiagnosticCamNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
