#!/usr/bin/env python3
"""
depth_colorizer.py — Unified RealSense RGB/Depth Streamer & QoS Bridge for MJPEG Streaming
- Bridges RealSense BEST_EFFORT topics (/camera/camera/color/image_raw, /camera/camera/depth/image_rect_raw)
  into RELIABLE QoS topics (/camera/color/image_raw, /camera/camera/depth/image_rect_raw/color)
- Colorizes 16-bit Depth Images (16UC1) to 8-bit BGR (TURBO colormap)
- Ensures web_video_server ALWAYS receives frames with 0 drops
"""
import time
import sys
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
from sensor_msgs.msg import Image, NavSatFix, Imu
from nav_msgs.msg import Odometry
import numpy as np
import cv2
from cv_bridge import CvBridge

class CameraStreamerNode(Node):
    def __init__(self):
        super().__init__('camera_streamer_node')
        self.bridge = CvBridge()
        self.last_depth_time = 0.0
        self.last_color_time = 0.0
        self.last_frame_received = 0.0

        # Sensor data QoS for subscribing (BEST_EFFORT)
        qos_sub = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        # Reliable QoS for web_video_server (RELIABLE)
        qos_pub = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        # Subscribers
        self.sub_depth = self.create_subscription(
            Image,
            '/camera/camera/depth/image_rect_raw',
            self.depth_callback,
            qos_sub
        )
        self.sub_color = self.create_subscription(
            Image,
            '/camera/camera/color/image_raw',
            self.color_callback,
            qos_sub
        )

        # Publishers
        self.pub_color = self.create_publisher(
            Image,
            '/camera/color/image_raw',
            qos_pub
        )
        self.pub_cam_color = self.create_publisher(
            Image,
            '/camera/camera/color/image_raw/stream',
            qos_pub
        )
        self.pub_depth_color = self.create_publisher(
            Image,
            '/camera/camera/depth/image_rect_raw/color',
            qos_pub
        )
        self.pub_depth_alt = self.create_publisher(
            Image,
            '/camera/camera/depth/color/image_raw',
            qos_pub
        )

        self.get_logger().info('Camera Streamer & QoS Bridge started (BEST_EFFORT sub -> RELIABLE pub)')

    def color_callback(self, msg: Image):
        # Throttle to max ~25 FPS to conserve CPU on ARM64
        now = time.time()
        if now - self.last_color_time < 0.04:
            return
        self.last_color_time = now
        self.last_frame_received = now

        # Republish color frame with RELIABLE QoS
        self.pub_color.publish(msg)
        self.pub_cam_color.publish(msg)

    def depth_callback(self, msg: Image):
        # Throttle depth colormapping to max ~15 FPS to conserve CPU
        now = time.time()
        if now - self.last_depth_time < 0.065:
            return
        self.last_depth_time = now

        try:
            depth_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding='passthrough')
            
            # Filter invalid / zero depth values (range 0.15m to 5.5m)
            mask = (depth_image > 150) & (depth_image < 5500)
            
            depth_scaled = np.zeros_like(depth_image, dtype=np.uint8)
            if np.any(mask):
                clipped = np.clip(depth_image, 150, 5500)
                norm = cv2.normalize(clipped, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
                depth_scaled = 255 - norm
            
            # Apply TURBO colormap
            color_depth = cv2.applyColorMap(depth_scaled, cv2.COLORMAP_TURBO)
            color_depth[~mask] = [20, 20, 20]

            out_msg = self.bridge.cv2_to_imgmsg(color_depth, encoding='bgr8')
            out_msg.header = msg.header
            
            self.pub_depth_color.publish(out_msg)
            self.pub_depth_alt.publish(out_msg)
        except Exception as e:
            self.get_logger().warn(f'Depth conversion error: {e}', throttle_duration_sec=5.0)

def main():
    rclpy.init()
    node = CameraStreamerNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()

