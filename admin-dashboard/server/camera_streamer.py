#!/usr/bin/env python3
"""
camera_streamer.py — High-Performance Direct V4L2 & RealSense ROS 2 Camera Streamer
- Automatically discovers RealSense RGB (/dev/video4, /dev/video0) or generic USB webcams
- Directly captures BGR frames at native 424x240 / 640x480 @ 15 FPS
- Publishes with RELIABLE QoS to:
    /camera/color/image_raw
    /camera/camera/color/image_raw
- Seamlessly falls back to Pro-Max Telemetry HUD if no physical camera is connected
- Colorizes 16-bit Depth (/camera/camera/depth/image_rect_raw) -> TURBO colormap
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

def find_rgb_video_device():
    # RealSense D435i RGB is typically /dev/video4
    for dev_idx in [4, 2, 0, 1, 3, 5]:
        dev_path = f"/dev/video{dev_idx}"
        if not os.path.exists(dev_path):
            continue
        try:
            cap = cv2.VideoCapture(dev_idx, cv2.CAP_V4L2)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 424)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
                cap.set(cv2.CAP_PROP_FPS, 15)
                ret, frame = cap.read()
                cap.release()
                if ret and frame is not None and frame.shape[0] > 0 and frame.shape[1] > 0:
                    if len(frame.shape) == 3 and frame.shape[2] == 3:
                        return dev_idx
        except Exception:
            pass
    return None

class CameraStreamerNode(Node):
    def __init__(self):
        super().__init__('camera_streamer_node')
        self.bridge = CvBridge()
        
        # QoS for web_video_server compatibility (RELIABLE)
        self.qos_pub = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=2,
            durability=DurabilityPolicy.VOLATILE
        )

        self.qos_sub = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        # Publishers for Dashboard & Web Video Server
        self.pub_color = self.create_publisher(Image, '/camera/color/image_raw', self.qos_pub)
        self.pub_color2 = self.create_publisher(Image, '/camera/camera/color/image_raw', self.qos_pub)
        self.pub_depth_color = self.create_publisher(Image, '/camera/camera/depth/image_rect_raw/color', self.qos_pub)

        # Telemetry subscribers for HUD overlay
        self.odom_pos = {"x": 0.0, "y": 0.0, "vx": 0.0, "wz": 0.0}
        self.imu_yaw = 0.0
        self.gps_info = {"lat": 0.0, "lon": 0.0, "alt": 0.0, "sats": 0}
        self.radar_angle = 0.0
        self.frame_idx = 0

        self.create_subscription(Odometry, '/odom', self.odom_cb, self.qos_sub)
        self.create_subscription(Imu, '/hiwonder/imu/data_raw', self.imu_cb, self.qos_sub)
        self.create_subscription(NavSatFix, '/hiwonder/gps/fix', self.gps_cb, self.qos_sub)
        self.create_subscription(Image, '/camera/camera/depth/image_rect_raw', self.depth_cb, self.qos_sub)

        # Hardware Camera Video Capture
        self.video_idx = find_rgb_video_device()
        self.cap = None
        if self.video_idx is not None:
            try:
                self.cap = cv2.VideoCapture(self.video_idx, cv2.CAP_V4L2)
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 424)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
                self.cap.set(cv2.CAP_PROP_FPS, 15)
                self.get_logger().info(f"Connected to RGB Optical Camera on /dev/video{self.video_idx} (424x240 @ 15fps)")
            except Exception as e:
                self.get_logger().warn(f"Failed to open /dev/video{self.video_idx}: {e}")
                self.cap = None
        else:
            self.get_logger().info("No physical optical RGB camera found. Running Pro-Max Telemetry HUD streamer.")

        # Timer at 15 FPS (66.6 ms)
        self.timer = self.create_timer(1.0 / 15.0, self.timer_tick)

    def odom_cb(self, msg: Odometry):
        self.odom_pos["x"] = msg.pose.pose.position.x
        self.odom_pos["y"] = msg.pose.pose.position.y
        self.odom_pos["vx"] = msg.twist.twist.linear.x
        self.odom_pos["wz"] = msg.twist.twist.angular.z

    def imu_cb(self, msg: Imu):
        q = msg.orientation
        siny_cosp = 2 * (q.w * q.z + q.x * q.y)
        cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
        self.imu_yaw = math.atan2(siny_cosp, cosy_cosp) * 180.0 / math.pi

    def gps_cb(self, msg: NavSatFix):
        self.gps_info["lat"] = msg.latitude
        self.gps_info["lon"] = msg.longitude
        self.gps_info["alt"] = msg.altitude

    def depth_cb(self, msg: Image):
        try:
            depth_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding='passthrough')
            mask = (depth_image > 150) & (depth_image < 5500)
            depth_scaled = np.zeros_like(depth_image, dtype=np.uint8)
            if np.any(mask):
                clipped = np.clip(depth_image, 150, 5500)
                norm = cv2.normalize(clipped, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
                depth_scaled = 255 - norm
            color_depth = cv2.applyColorMap(depth_scaled, cv2.COLORMAP_TURBO)
            color_depth[~mask] = [20, 20, 20]
            out_msg = self.bridge.cv2_to_imgmsg(color_depth, encoding='bgr8')
            out_msg.header = msg.header
            self.pub_depth_color.publish(out_msg)
        except Exception:
            pass

    def generate_hud_frame(self):
        w, h = 640, 360
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:, :] = [16, 20, 26]

        # Grid lines
        for x in range(0, w, 40):
            cv2.line(frame, (x, 0), (x, h), (26, 32, 44), 1)
        for y in range(0, h, 40):
            cv2.line(frame, (0, y), (w, y), (26, 32, 44), 1)

        # Header banner
        cv2.rectangle(frame, (0, 0), (w, 36), (22, 28, 38), -1)
        cv2.putText(frame, "HYBRID-AMR TELEMETRY HUD  |  PRO-MAX STREAM", (16, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 1, cv2.LINE_AA)
        
        status_text = "OPTICAL CAM: OFFLINE" if self.cap is None else f"OPTICAL CAM: /dev/video{self.video_idx}"
        cv2.putText(frame, status_text, (w - 240, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 180), 1, cv2.LINE_AA)

        # Central Radar Reticle
        cx, cy, radius = 320, 195, 100
        cv2.circle(frame, (cx, cy), radius, (0, 180, 255), 1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), int(radius * 0.6), (0, 140, 200), 1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), int(radius * 0.3), (0, 100, 160), 1, cv2.LINE_AA)

        # Sweep line
        self.radar_angle = (self.radar_angle + 6.0) % 360.0
        rad = math.radians(self.radar_angle)
        sx = int(cx + radius * math.cos(rad))
        sy = int(cy + radius * math.sin(rad))
        cv2.line(frame, (cx, cy), (sx, sy), (0, 255, 255), 2, cv2.LINE_AA)

        # Telemetry readouts
        cv2.putText(frame, f"POS X: {self.odom_pos['x']:+.2f} m", (24, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(frame, f"POS Y: {self.odom_pos['y']:+.2f} m", (24, 95),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(frame, f"SPEED: {self.odom_pos['vx']:.2f} m/s", (24, 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1, cv2.LINE_AA)
        cv2.putText(frame, f"YAW:   {self.imu_yaw:+.1f} deg", (24, 145),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 200, 0), 1, cv2.LINE_AA)

        # GPS readouts
        cv2.putText(frame, f"GPS LAT: {self.gps_info['lat']:.6f}", (w - 210, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 220), 1, cv2.LINE_AA)
        cv2.putText(frame, f"GPS LON: {self.gps_info['lon']:.6f}", (w - 210, 95),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 220), 1, cv2.LINE_AA)
        cv2.putText(frame, f"ALT:     {self.gps_info['alt']:.1f} m", (w - 210, 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 220), 1, cv2.LINE_AA)

        # Bottom Bar
        cv2.rectangle(frame, (0, h - 28), (w, h), (18, 22, 30), -1)
        cv2.putText(frame, "ROS 2 Jazzy | FastDDS UDP | 15 FPS Active Stream", (16, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (140, 160, 180), 1, cv2.LINE_AA)

        return frame

    def timer_tick(self):
        if not rclpy.ok():
            return
        frame = None
        if self.cap is not None:
            ret, captured = self.cap.read()
            if ret and captured is not None:
                frame = captured
            else:
                self.cap.release()
                self.video_idx = find_rgb_video_device()
                if self.video_idx is not None:
                    self.cap = cv2.VideoCapture(self.video_idx, cv2.CAP_V4L2)
                else:
                    self.cap = None

        if frame is None:
            frame = self.generate_hud_frame()

        self.frame_idx += 1
        try:
            now = self.get_clock().now().to_msg()
            img_msg = self.bridge.cv2_to_imgmsg(frame, encoding='bgr8')
            img_msg.header.stamp = now
            img_msg.header.frame_id = "camera_color_optical_frame"

            if rclpy.ok():
                self.pub_color.publish(img_msg)
                self.pub_color2.publish(img_msg)
        except Exception:
            pass

    def destroy_node(self):
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
        super().destroy_node()

def main():
    rclpy.init()
    node = CameraStreamerNode()
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
