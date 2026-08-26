#!/usr/bin/env python3

import serial
import rclpy

from rclpy.node import Node

from sensor_msgs.msg import Imu
from sensor_msgs.msg import MagneticField


class IMUSerialNode(Node):

    def __init__(self):

        super().__init__('imu_serial_node')

        # ============================
        # Parameters
        # ============================

        self.declare_parameter(
            'port',
            '/dev/amr_imu'
        )

        self.declare_parameter(
            'baudrate',
            115200
        )

        self.declare_parameter(
            'frame_id',
            'imu_link'
        )

        port = self.get_parameter(
            'port'
        ).value

        baudrate = self.get_parameter(
            'baudrate'
        ).value

        self.frame_id = self.get_parameter(
            'frame_id'
        ).value

        # ============================
        # Serial
        # ============================

        self.get_logger().info(
            f'Opening serial port: {port}'
        )

        try:

            self.serial = serial.Serial(
                port,
                baudrate,
                timeout=0.1
            )

            self.get_logger().info(
                'Serial connection established'
            )

        except Exception as e:

            self.get_logger().error(
                f'Failed to open serial port: {e}'
            )

            raise

        # ============================
        # Publishers
        # ============================

        self.imu_pub = self.create_publisher(
            Imu,
            '/imu/data_raw',
            20
        )

        self.mag_pub = self.create_publisher(
            MagneticField,
            '/imu/mag',
            20
        )

        # ============================
        # Timer
        # ============================

        self.timer = self.create_timer(
            0.005,
            self.read_serial
        )

        self.get_logger().info(
            'GY-80 IMU node started'
        )

    # =================================
    # Read serial
    # =================================

    def read_serial(self):

        try:

            while self.serial.in_waiting:

                line = self.serial.readline().decode(
                    'utf-8',
                    errors='ignore'
                ).strip()

                if not line:
                    continue

                self.process_line(line)

        except Exception as e:

            self.get_logger().error(
                f'Serial read error: {e}'
            )

    # =================================
    # Process packet
    # =================================

    def process_line(self, line):

        if not line.startswith('IMU,'):
            return

        try:

            parts = line.split(',')

            if len(parts) != 8:
                return

            ax = float(parts[1])
            ay = float(parts[2])
            az = float(parts[3])

            mx = float(parts[4])
            my = float(parts[5])
            mz = float(parts[6])

            # ESP32 timestamp
            # Currently not used for ROS timestamp.
            esp_time = int(parts[7])

            now = self.get_clock().now().to_msg()

            # =========================
            # IMU message
            # =========================

            imu_msg = Imu()

            imu_msg.header.stamp = now
            imu_msg.header.frame_id = self.frame_id

            # Accelerometer
            imu_msg.linear_acceleration.x = ax
            imu_msg.linear_acceleration.y = ay
            imu_msg.linear_acceleration.z = az

            # Angular velocity unavailable
            imu_msg.angular_velocity.x = 0.0
            imu_msg.angular_velocity.y = 0.0
            imu_msg.angular_velocity.z = 0.0

            # Orientation unavailable initially
            imu_msg.orientation_covariance[0] = -1.0

            # Unknown covariance
            imu_msg.linear_acceleration_covariance[0] = -1.0
            imu_msg.angular_velocity_covariance[0] = -1.0

            self.imu_pub.publish(imu_msg)

            # =========================
            # Magnetometer message
            # =========================

            mag_msg = MagneticField()

            mag_msg.header.stamp = now
            mag_msg.header.frame_id = self.frame_id

            # HMC5883L normally needs
            # calibration and unit conversion.
            #
            # Do NOT treat raw values as Tesla yet.

            mag_msg.magnetic_field.x = mx
            mag_msg.magnetic_field.y = my
            mag_msg.magnetic_field.z = mz

            mag_msg.magnetic_field_covariance[0] = -1.0

            self.mag_pub.publish(
                mag_msg
            )

        except ValueError:

            self.get_logger().warning(
                f'Invalid IMU packet: {line}'
            )


def main(args=None):

    rclpy.init(args=args)

    node = IMUSerialNode()

    try:

        rclpy.spin(node)

    except KeyboardInterrupt:
        pass

    finally:

        node.destroy_node()

        rclpy.shutdown()


if __name__ == '__main__':
    main()
