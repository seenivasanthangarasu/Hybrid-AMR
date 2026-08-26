#!/usr/bin/env python3
"""
depth_colorizer.py — Colorizes 16-bit Depth Images (16UC1) to 8-bit BGR for MJPEG streaming
Subscribes to: /camera/camera/depth/image_rect_raw (16UC1)
Publishes to:  /camera/camera/depth/image_rect_raw/color (bgr8) and /camera/camera/depth/color/image_raw
"""
import time
import sys
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import Image
import numpy as np
import cv2
from cv_bridge import CvBridge

class DepthColorizerNode(Node):
    def __init__(self):
        super().__init__('depth_colorizer_node')
        self.bridge = CvBridge()
        self.last_proc_time = 0.0

        # QoS compatible with RealSense depth publisher (Sensor Data / BEST_EFFORT)
        qos_sub = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        # QoS for web_video_server compatibility (RELIABLE)
        qos_pub = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
            durability=DurabilityPolicy.VOLATILE
        )

        self.sub1 = self.create_subscription(
            Image,
            '/camera/camera/depth/image_rect_raw',
            self.depth_callback,
            qos_sub
        )

        self.sub2 = self.create_subscription(
            Image,
            '/camera/depth/image_rect_raw',
            self.depth_callback,
            qos_sub
        )

        self.pub_color = self.create_publisher(
            Image,
            '/camera/camera/depth/image_rect_raw/color',
            qos_pub
        )
        self.pub_alt = self.create_publisher(
            Image,
            '/camera/camera/depth/color/image_raw',
            qos_pub
        )

        self.get_logger().info('Depth Colorizer Node started (QoS: BEST_EFFORT sub -> RELIABLE pub)')

    def depth_callback(self, msg: Image):
        # Throttle to max ~15 FPS to conserve CPU on ARM64
        now = time.time()
        if now - self.last_proc_time < 0.065:
            return
        self.last_proc_time = now

        try:
            depth_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding='passthrough')
            
            # Filter invalid / zero depth values (range 0.15m to 5.5m)
            mask = (depth_image > 150) & (depth_image < 5500)
            
            depth_scaled = np.zeros_like(depth_image, dtype=np.uint8)
            if np.any(mask):
                clipped = np.clip(depth_image, 150, 5500)
                norm = cv2.normalize(clipped, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
                # Closer is warmer/red, further is cool/blue
                depth_scaled = 255 - norm
            
            # Apply vivid TURBO colormap
            color_depth = cv2.applyColorMap(depth_scaled, cv2.COLORMAP_TURBO)
            
            # Mask out background/no-return regions
            color_depth[~mask] = [20, 20, 20]

            out_msg = self.bridge.cv2_to_imgmsg(color_depth, encoding='bgr8')
            out_msg.header = msg.header
            
            self.pub_color.publish(out_msg)
            self.pub_alt.publish(out_msg)
        except Exception as e:
            self.get_logger().warn(f'Colorizer conversion error: {e}', throttle_duration_sec=5.0)

def main():
    rclpy.init()
    node = DepthColorizerNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
