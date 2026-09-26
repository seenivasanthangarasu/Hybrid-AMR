#!/usr/bin/env python3
"""
camera_streamer.py — High-Performance Direct V4L2 ROS 2 Camera Streamer
- Automatically discovers Logitech C270 HD Webcam (/dev/amr_camera, /dev/video0) or generic USB webcams
- Directly captures BGR frames at native HD 720p (1280x720 @ 30 FPS, MJPG) or standard VGA
- Publishes with RELIABLE QoS to:
    /camera/color/image_raw
    /camera/camera/color/image_raw
- Seamlessly falls back to Pro-Max Telemetry HUD if no physical camera is connected
- Colorizes 16-bit Depth (/camera/camera/depth/image_rect_raw) -> TURBO colormap if depth data present
"""
import os
import sys
import time
import math
import cv2
import numpy as np

import rclpy
import threading
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
from sensor_msgs.msg import Image, NavSatFix, Imu
from nav_msgs.msg import Odometry
from cv_bridge import CvBridge

def open_video_capture(device_target):
    """
    Open V4L2 VideoCapture on device index or device node path.
    Prioritizes 1280x720 MJPG @ 30fps (Logitech C270 native HD).
    Falls back gracefully to 640x480 / default.
    """
    cap = cv2.VideoCapture(device_target, cv2.CAP_V4L2)
    if not cap.isOpened():
        return None

    # Try native 720p MJPG first (standard for Logitech C270)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    ret, frame = cap.read()
    if ret and frame is not None and frame.shape[0] > 0 and frame.shape[1] > 0:
        return cap

    # Fallback to standard 640x480
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 20)
    ret, frame = cap.read()
    if ret and frame is not None and frame.shape[0] > 0 and frame.shape[1] > 0:
        return cap

    cap.release()
    return None

def find_rgb_video_device():
    # 1. Check persistent udev symlink first
    for symlink in ["/dev/amr_camera", "/dev/logi_cam", "/dev/video_cam"]:
        if os.path.exists(symlink):
            test_cap = open_video_capture(symlink)
            if test_cap is not None:
                test_cap.release()
                return symlink

    # 2. Check standard video indices (/dev/video0, /dev/video1, etc.)
    for dev_idx in [0, 1, 2, 4, 3, 5]:
        dev_path = f"/dev/video{dev_idx}"
        if not os.path.exists(dev_path):
            continue
        test_cap = open_video_capture(dev_idx)
        if test_cap is not None:
            test_cap.release()
            return dev_idx
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
        self.video_dev = find_rgb_video_device()
        self.cap = None
        self.lock = threading.Lock()
        self.latest_frame = None
        self.running = True

        if self.video_dev is not None:
            try:
                self.cap = open_video_capture(self.video_dev)
                if self.cap is not None:
                    actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
                    self.get_logger().info(f"Connected to Logitech C270 / USB Camera on {self.video_dev} ({actual_w}x{actual_h} @ {actual_fps}fps)")
                else:
                    self.get_logger().warn(f"Failed to open camera on {self.video_dev}")
            except Exception as e:
                self.get_logger().warn(f"Exception opening camera {self.video_dev}: {e}")
                self.cap = None
        else:
            self.get_logger().info("No physical optical RGB camera found. Running Pro-Max Telemetry HUD streamer.")

        # Dedicated background worker thread for non-blocking V4L2 acquisition
        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

        # Timer at 20 FPS (50.0 ms) for smooth low-CPU streaming
        self.timer = self.create_timer(1.0 / 20.0, self.timer_tick)

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
        
        status_text = "OPTICAL CAM: OFFLINE" if self.cap is None else f"OPTICAL CAM: {self.video_dev}"
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
        cv2.putText(frame, "ROS 2 Jazzy | FastDDS UDP | 20 FPS Active Stream", (16, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (140, 160, 180), 1, cv2.LINE_AA)

        return frame

    def _capture_worker(self):
        while self.running and rclpy.ok():
            if self.cap is not None and self.cap.isOpened():
                ret, frame = self.cap.read()
                if ret and frame is not None and frame.shape[0] > 0 and frame.shape[1] > 0:
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
                else:
                    time.sleep(0.01)
            else:
                # Try auto-detecting camera device
                dev = find_rgb_video_device()
                if dev is not None:
                    cap = open_video_capture(dev)
                    if cap is not None:
                        self.video_dev = dev
                        self.cap = cap
                time.sleep(0.5)

    def timer_tick(self):
        # Fallback HUD timer (active when no physical camera is connected)
        if not rclpy.ok() or (self.cap is not None and self.cap.isOpened()):
            return

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
        self.running = False
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
