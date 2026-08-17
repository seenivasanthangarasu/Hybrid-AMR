#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix
import subprocess


class HybridManager(Node):

    def __init__(self):
        super().__init__('hybrid_manager')

        self.gps_valid = False

        self.gps_proc = None
        self.lidar_proc = None
        self.odom_proc = None
        self.slam_proc = None
        self.rviz_proc = None

        self.state = "GPS_SEARCH"

        self.gps_search_timeout = 30
        self.elapsed_seconds = 0

        self.get_logger().info("================================")
        self.get_logger().info("Hybrid Navigation Manager Started")
        self.get_logger().info(f"State : {self.state}")
        self.get_logger().info(
            f"GPS Search Timeout : {self.gps_search_timeout} sec"
        )
        self.get_logger().info("================================")

        self.subscription = self.create_subscription(
            NavSatFix,
            '/fix',
            self.gps_callback,
            10
        )

        self.timer = self.create_timer(
            1.0,
            self.timer_callback
        )

        self.start_gps()

    # --------------------------------------------------
    # START GPS
    # --------------------------------------------------
    def start_gps(self):

        if self.gps_proc is not None:
            self.get_logger().info("GPS already running")
            return

        self.get_logger().warn("STARTING GPS NODE...")

        try:

            self.gps_proc = subprocess.Popen([
                '/bin/bash',
                '-c',
                'source /opt/ros/jazzy/setup.bash && '
                'source /home/ubuntu/ros2_ws/install/setup.bash && '
                'ros2 run ublox_gps ublox_gps_node '
                '--ros-args --params-file /home/ubuntu/ublox_config.yaml'
            ])

            self.get_logger().info("GPS NODE STARTED")

        except Exception as e:

            self.get_logger().error(
                f"GPS START FAILED: {e}"
            )

    # --------------------------------------------------
    # GPS CALLBACK
    # --------------------------------------------------
    def gps_callback(self, msg):

        lat = msg.latitude
        lon = msg.longitude

        gps_now_valid = (lat != 0.0 and lon != 0.0)

        if gps_now_valid != self.gps_valid:

            self.gps_valid = gps_now_valid

            if self.gps_valid:

                self.get_logger().info(
                    f"GPS VALID | Lat={lat:.6f} Lon={lon:.6f}"
                )

                if self.state == "SLAM_MODE":

                    self.get_logger().warn(
                        "GPS RECOVERED -> GPS_MODE"
                    )

                    self.state = "GPS_MODE"

            else:

                self.get_logger().warn(
                    "GPS STATE CHANGED -> INVALID"
                )

                if self.state == "GPS_MODE":

                    self.get_logger().warn("GPS LOST")

                    self.state = "SLAM_MODE"

                    self.get_logger().warn(
                        "STATE CHANGE -> SLAM_MODE"
                    )

                    self.start_lidar()
                    self.start_odom()
                    self.start_slam()
                    self.start_rviz()

    # --------------------------------------------------
    # START LIDAR
    # --------------------------------------------------
    def start_lidar(self):

        if self.lidar_proc is not None:
            return

        self.get_logger().warn("STARTING LIDAR...")

        self.lidar_proc = subprocess.Popen([
            '/bin/bash',
            '-c',
            'source /opt/ros/jazzy/setup.bash && '
            'source /home/ubuntu/ros2_ws/install/setup.bash && '
            'ros2 launch ydlidar_ros2_driver ydlidar_launch.py'
        ])

        self.get_logger().info("LIDAR STARTED")

    # --------------------------------------------------
    # START ODOM
    # --------------------------------------------------
    def start_odom(self):

        if self.odom_proc is not None:
            return

        self.get_logger().warn("STARTING ODOM...")

        self.odom_proc = subprocess.Popen([
            '/bin/bash',
            '-c',
            'source /opt/ros/jazzy/setup.bash && '
            'source /home/ubuntu/ros2_ws/install/setup.bash && '
            'ros2 run esp32_odom odom_node'
        ])

        self.get_logger().info("ODOM STARTED")

    # --------------------------------------------------
    # START SLAM
    # --------------------------------------------------
    def start_slam(self):

        if self.slam_proc is not None:
            return

        self.get_logger().warn(
            "STARTING SLAM TOOLBOX..."
        )

        self.slam_proc = subprocess.Popen([
            '/bin/bash',
            '-c',
            'source /opt/ros/jazzy/setup.bash && '
            'source /home/ubuntu/ros2_ws/install/setup.bash && '
            'ros2 launch slam_toolbox online_sync_launch.py'
        ])

        self.get_logger().info(
            "SLAM TOOLBOX STARTED"
        )

    # --------------------------------------------------
    # START RVIZ
    # --------------------------------------------------
    def start_rviz(self):

        if self.rviz_proc is not None:
            return

        self.get_logger().warn("STARTING RVIZ...")

        self.rviz_proc = subprocess.Popen([
            'rviz2'
        ])

    # --------------------------------------------------
    # TIMER CALLBACK
    # --------------------------------------------------
    def timer_callback(self):

        if self.state != "GPS_SEARCH":
            return

        self.elapsed_seconds += 1

        if self.elapsed_seconds % 5 == 0:

            self.get_logger().info(
                f"GPS_SEARCH : "
                f"{self.elapsed_seconds}/"
                f"{self.gps_search_timeout} sec"
            )

        if self.gps_valid:

            self.state = "GPS_MODE"

            self.get_logger().info(
                "STATE CHANGE -> GPS_MODE"
            )

            return

        if self.elapsed_seconds >= self.gps_search_timeout:

            self.state = "SLAM_MODE"

            self.get_logger().warn(
                "GPS TIMEOUT"
            )

            self.get_logger().warn(
                "STATE CHANGE -> SLAM_MODE"
            )

            self.start_lidar()
            self.start_odom()
            self.start_slam()
            self.start_rviz()

    # --------------------------------------------------
    # CLEANUP
    # --------------------------------------------------
    def cleanup(self):

        for proc in [
            self.gps_proc,
            self.lidar_proc,
            self.odom_proc,
            self.slam_proc,
            self.rviz_proc
        ]:

            if proc is not None:
                proc.terminate()

    # --------------------------------------------------
    # DESTROY NODE
    # --------------------------------------------------
    def destroy_node(self):

        self.cleanup()
        super().destroy_node()


# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main(args=None):

    rclpy.init(args=args)

    node = HybridManager()

    try:

        rclpy.spin(node)

    except KeyboardInterrupt:

        node.get_logger().info(
            "Hybrid Manager Stopped"
        )

    finally:

        node.cleanup()

        node.destroy_node()

        rclpy.shutdown()


if __name__ == '__main__':
    main()
