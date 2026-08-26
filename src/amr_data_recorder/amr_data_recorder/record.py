#!/usr/bin/env python3

import os
import subprocess
from datetime import datetime

import rclpy
from rclpy.node import Node


class AMRDataRecorder(Node):

    def __init__(self):
        super().__init__('amr_data_recorder')

        # ==================================================
        # DATA DIRECTORY
        # ==================================================

        self.base_dir = os.path.expanduser('~/amr_data')

        os.makedirs(
            self.base_dir,
            exist_ok=True
        )

        # ==================================================
        # TOPICS TO RECORD
        # ==================================================

        self.topics = [
            # LiDAR
            '/scan',

            # IMU
            '/hiwonder/imu/data_raw',
            '/hiwonder/imu/mag',
            '/imu/data_raw',
            '/imu/mag',

            # Encoder / Odometry
            '/odom',
            '/joint_states',

            # GPS
            '/hiwonder/gps/fix',
            '/hiwonder/gps/nmea',
            '/fix',

            # Robot command
            '/cmd_vel',

            # TF
            '/tf',
            '/tf_static',

            # SLAM / Localization
            '/pose',
            '/map',
        ]

        # ==================================================
        # HEADER
        # ==================================================

        print()
        print("=" * 60)
        print("             AMR DATA RECORDER")
        print("=" * 60)
        print()

        print(
            f"Data directory: {self.base_dir}"
        )

        print()

        # ==================================================
        # EXPERIMENT NAME
        # ==================================================

        experiment_name = input(
            "Enter experiment name "
            "(press ENTER for automatic name): "
        ).strip()

        # ==================================================
        # DATE + TIME
        # ==================================================

        timestamp = datetime.now().strftime(
            '%Y-%m-%d_%H-%M-%S'
        )

        # ==================================================
        # CREATE SAFE FOLDER NAME
        # ==================================================

        if experiment_name:

            experiment_name = experiment_name.replace(
                ' ',
                '_'
            )

            safe_name = ''.join(
                c
                for c in experiment_name
                if c.isalnum() or c in ('_', '-')
            )

            folder_name = (
                f'{timestamp}_{safe_name}'
            )

        else:

            folder_name = timestamp

        # ==================================================
        # RECORDING DIRECTORY
        # ==================================================

        self.record_dir = os.path.join(
            self.base_dir,
            folder_name
        )

        os.makedirs(
            self.record_dir,
            exist_ok=True
        )

        # ==================================================
        # SAVE INFORMATION
        # ==================================================

        self.experiment_name = experiment_name

        self.timestamp = timestamp

        self.metadata_file = os.path.join(
            self.record_dir,
            'metadata.yaml'
        )

        # ==================================================
        # CREATE METADATA
        # ==================================================

        self.create_metadata()

        # ==================================================
        # ROS BAG NAME
        # ==================================================

        bag_name = os.path.join(
            self.record_dir,
            'rosbag'
        )

        # ==================================================
        # ROS BAG COMMAND
        # ==================================================

        command = [
            'ros2',
            'bag',
            'record',
            '-s',
            'mcap',
            '-o',
            bag_name
        ]

        command.extend(
            self.topics
        )

        # ==================================================
        # DISPLAY RECORDING INFORMATION
        # ==================================================

        print()

        print("=" * 60)
        print("Starting AMR data recording")
        print("=" * 60)

        print()

        print(
            f"Experiment : "
            f"{self.experiment_name or 'Unnamed'}"
        )

        print(
            f"Start time : {self.timestamp}"
        )

        print(
            f"Directory  : {self.record_dir}"
        )

        print()

        print("Topics:")

        for topic in self.topics:

            print(
                f"  {topic}"
            )

        print()

        print(
            "Press CTRL+C to stop recording."
        )

        print("=" * 60)

        print()

        # ==================================================
        # START ROS BAG
        # ==================================================

        try:

            self.process = subprocess.Popen(
                command
            )

        except Exception as error:

            print()
            print(
                "ERROR: Failed to start rosbag."
            )

            print(error)

            self.process = None

    # ======================================================
    # CREATE METADATA
    # ======================================================

    def create_metadata(self):

        with open(
            self.metadata_file,
            'w'
        ) as file:

            file.write(
                f"""experiment_name: "{self.experiment_name}"
date_time: "{self.timestamp}"

robot:
  type: "AMR"
  ros_version: "ROS 2 Jazzy"

sensors:
  lidar: "YDLIDAR"
  imu: "GY-80"
  odometry: "ESP32"
  encoder: "joint_states"
  gps: "GPS NavSatFix"

localization:
  method: "SLAM Toolbox"

recording:
  storage: "MCAP"

topics:
"""
            )

            for topic in self.topics:

                file.write(
                    f'  - "{topic}"\n'
                )

            file.write(
                """
notes: ""
"""
            )

    # ======================================================
    # STOP RECORDING
    # ======================================================

    def stop_recording(self):

        if self.process is None:
            return

        print()
        print()
        print("=" * 60)
        print("Stopping recording...")
        print("=" * 60)

        try:

            self.process.terminate()

            self.process.wait(
                timeout=10
            )

        except subprocess.TimeoutExpired:

            print(
                "Recording did not stop normally."
            )

            self.process.kill()

        print()
        print("=" * 60)
        print("Recording completed.")
        print("=" * 60)

        print()

        print(
            "Data saved to:"
        )

        print(
            self.record_dir
        )

        print()

    # ======================================================
    # MAIN
    # ======================================================


def main(args=None):

    rclpy.init(
        args=args
    )

    recorder = None

    try:

        recorder = AMRDataRecorder()

        rclpy.spin(
            recorder
        )

    except KeyboardInterrupt:

        print()
        print(
            "CTRL+C detected."
        )

    finally:

        if recorder is not None:

            recorder.stop_recording()

            try:

                recorder.destroy_node()

            except Exception:

                pass

        try:

            if rclpy.ok():

                rclpy.shutdown()

        except Exception:

            pass


if __name__ == '__main__':

    main()
