#!/usr/bin/env python3

import os
import time
import math
import struct
import serial

import rclpy
from rclpy.node import Node

from sensor_msgs.msg import Imu, MagneticField


class HiwonderIMUNode(Node):

    def __init__(self):
        super().__init__('hiwonder_imu_node')

        # Parameters
        self.declare_parameter('port', '/dev/hiwonder_imu')
        self.declare_parameter('baudrate', 9600)

        self.configured_port = self.get_parameter('port').value
        self.baudrate = self.get_parameter('baudrate').value
        self.port = self.configured_port

        self.get_logger().info(
            f'Hiwonder IMU Node initializing (target: {self.configured_port} @ {self.baudrate} baud)'
        )

        # Serial connection state
        self.serial = None
        self.last_reconnect_time = 0.0
        self.connect_serial()

        # ROS publishers
        self.imu_pub = self.create_publisher(
            Imu,
            '/hiwonder/imu/data_raw',
            10
        )

        self.mag_pub = self.create_publisher(
            MagneticField,
            '/hiwonder/imu/mag',
            10
        )

        # Sensor storage
        self.accel = None
        self.gyro = None
        self.rpy = None
        self.mag = None

        # Serial parser buffer
        self.buffer = bytearray()

        # Read serial frequently (100 Hz timer)
        self.timer = self.create_timer(
            0.01,
            self.read_serial
        )

        self.get_logger().info('Hiwonder IMU node started')

    def connect_serial(self):
        """Open the IMU serial port from configured path or fallback candidates."""
        candidate_ports = [
            self.configured_port,
            '/dev/hiwonder_imu',
            '/dev/amr_imu',
            '/dev/esp-imu',
            '/dev/ttyUSB1',
            '/dev/ttyUSB3',
            '/dev/ttyUSB2',
            '/dev/ttyUSB0'
        ]

        ports_to_try = []
        for p in candidate_ports:
            if p and p not in ports_to_try and os.path.exists(p):
                ports_to_try.append(p)

        for p in ports_to_try:
            try:
                self.serial = serial.Serial(
                    port=p,
                    baudrate=self.baudrate,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE,
                    timeout=0.1,
                    write_timeout=1,
                    rtscts=False,
                    dsrdtr=False,
                    xonxoff=False
                )
                self.port = p
                self.get_logger().info(f'Successfully opened Hiwonder IMU: {p} @ {self.baudrate} baud')
                return True
            except Exception as e:
                self.get_logger().warn(f'Candidate IMU port {p} open failed: {e}', throttle_duration_sec=5.0)

        self.serial = None
        self.get_logger().warn(f'No accessible IMU port found among candidates: {ports_to_try}', throttle_duration_sec=5.0)
        return False

    # ---------------------------------------------------------
    # SERIAL READER
    # ---------------------------------------------------------

    def read_serial(self):
        if not self.serial or not self.serial.is_open:
            now = time.time()
            if now - self.last_reconnect_time > 2.0:
                self.last_reconnect_time = now
                self.connect_serial()
            return

        try:
            bytes_to_read = self.serial.in_waiting
            if bytes_to_read > 0:
                data = self.serial.read(bytes_to_read)
                if data:
                    self.buffer.extend(data)

            while len(self.buffer) >= 11:
                # Find frame header (0x55)
                if self.buffer[0] != 0x55:
                    del self.buffer[0]
                    continue

                frame = bytes(self.buffer[:11])

                # Checksum validation
                checksum = sum(frame[:10]) & 0xFF
                if checksum != frame[10]:
                    del self.buffer[0]
                    continue

                frame_type = frame[1]
                self.parse_frame(frame_type, frame)
                del self.buffer[:11]

        except serial.SerialException as e:
            self.get_logger().warn(f'IMU serial connection lost on {self.port}: {e}. Reconnecting...', throttle_duration_sec=5.0)
            try:
                if self.serial:
                    self.serial.close()
            except Exception:
                pass
            self.serial = None
        except Exception as e:
            self.get_logger().warn(f'IMU read error: {e}', throttle_duration_sec=2.0)

    # ---------------------------------------------------------
    # FRAME PARSER
    # ---------------------------------------------------------

    def parse_frame(
        self,
        frame_type,
        frame
    ):

        values = struct.unpack(
            '<hhhh',
            frame[2:10]
        )

        if frame_type == 0x51:

            self.parse_acceleration(
                values
            )

        elif frame_type == 0x52:

            self.parse_gyro(
                values
            )

        elif frame_type == 0x53:

            self.parse_angle(
                values
            )

        elif frame_type == 0x54:

            self.parse_magnetic(
                values
            )

    # ---------------------------------------------------------
    # ACCELERATION
    # ---------------------------------------------------------

    def parse_acceleration(
        self,
        values
    ):

        ax_raw, ay_raw, az_raw, _ = values

        g = 9.80665

        ax = (
            ax_raw /
            32768.0 *
            16.0 *
            g
        )

        ay = (
            ay_raw /
            32768.0 *
            16.0 *
            g
        )

        az = (
            az_raw /
            32768.0 *
            16.0 *
            g
        )

        self.accel = (
            ax,
            ay,
            az
        )

        self.publish_imu()

    # ---------------------------------------------------------
    # GYROSCOPE
    # ---------------------------------------------------------

    def parse_gyro(
        self,
        values
    ):

        gx_raw, gy_raw, gz_raw, _ = values

        deg_to_rad = math.pi / 180.0

        gx = (
            gx_raw /
            32768.0 *
            2000.0 *
            deg_to_rad
        )

        gy = (
            gy_raw /
            32768.0 *
            2000.0 *
            deg_to_rad
        )

        gz = (
            gz_raw /
            32768.0 *
            2000.0 *
            deg_to_rad
        )

        self.gyro = (
            gx,
            gy,
            gz
        )

        self.publish_imu()

    # ---------------------------------------------------------
    # ANGLE / ORIENTATION
    # ---------------------------------------------------------

    def parse_angle(
        self,
        values
    ):

        roll_raw, pitch_raw, yaw_raw, _ = values

        roll = (
            roll_raw /
            32768.0 *
            180.0
        )

        pitch = (
            pitch_raw /
            32768.0 *
            180.0
        )

        yaw = (
            yaw_raw /
            32768.0 *
            180.0
        )

        self.rpy = (
            roll,
            pitch,
            yaw
        )

        self.publish_imu()

    # ---------------------------------------------------------
    # MAGNETOMETER
    # ---------------------------------------------------------

    def parse_magnetic(
        self,
        values
    ):

        mx_raw, my_raw, mz_raw, _ = values

        # Hiwonder documentation exposes these
        # as raw magnetic sensor values.
        #
        # Do NOT assume Tesla conversion here.
        # Keep raw values until exact sensor
        # sensitivity is confirmed.

        self.mag = (
            float(mx_raw),
            float(my_raw),
            float(mz_raw)
        )

        msg = MagneticField()

        msg.header.stamp = (
            self.get_clock()
            .now()
            .to_msg()
        )

        msg.header.frame_id = 'imu_link'

        msg.magnetic_field.x = self.mag[0]
        msg.magnetic_field.y = self.mag[1]
        msg.magnetic_field.z = self.mag[2]

        self.mag_pub.publish(msg)

    # ---------------------------------------------------------
    # RPY → QUATERNION
    # ---------------------------------------------------------

    def rpy_to_quaternion(
        self,
        roll_deg,
        pitch_deg,
        yaw_deg
    ):

        roll = math.radians(
            roll_deg
        )

        pitch = math.radians(
            pitch_deg
        )

        yaw = math.radians(
            yaw_deg
        )

        cr = math.cos(
            roll / 2.0
        )

        sr = math.sin(
            roll / 2.0
        )

        cp = math.cos(
            pitch / 2.0
        )

        sp = math.sin(
            pitch / 2.0
        )

        cy = math.cos(
            yaw / 2.0
        )

        sy = math.sin(
            yaw / 2.0
        )

        qw = (
            cr * cp * cy +
            sr * sp * sy
        )

        qx = (
            sr * cp * cy -
            cr * sp * sy
        )

        qy = (
            cr * sp * cy +
            sr * cp * sy
        )

        qz = (
            cr * cp * sy -
            sr * sp * cy
        )

        return (
            qx,
            qy,
            qz,
            qw
        )

    # ---------------------------------------------------------
    # PUBLISH IMU
    # ---------------------------------------------------------

    def publish_imu(self):

        # We need all three measurements
        if self.accel is None:
            return

        if self.gyro is None:
            return

        if self.rpy is None:
            return

        msg = Imu()

        msg.header.stamp = (
            self.get_clock()
            .now()
            .to_msg()
        )

        msg.header.frame_id = 'imu_link'

        # -------------------------
        # Orientation
        # -------------------------

        qx, qy, qz, qw = (
            self.rpy_to_quaternion(
                self.rpy[0],
                self.rpy[1],
                self.rpy[2]
            )
        )

        msg.orientation.x = qx
        msg.orientation.y = qy
        msg.orientation.z = qz
        msg.orientation.w = qw

        # -------------------------
        # Angular velocity
        # -------------------------

        msg.angular_velocity.x = (
            self.gyro[0]
        )

        msg.angular_velocity.y = (
            self.gyro[1]
        )

        msg.angular_velocity.z = (
            self.gyro[2]
        )

        # -------------------------
        # Linear acceleration
        # -------------------------

        msg.linear_acceleration.x = (
            self.accel[0]
        )

        msg.linear_acceleration.y = (
            self.accel[1]
        )

        msg.linear_acceleration.z = (
            self.accel[2]
        )

        # -------------------------
        # Covariance
        # -------------------------

        # Unknown until we characterize
        # the sensor properly.
        msg.orientation_covariance = [
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        ]

        msg.angular_velocity_covariance = [
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        ]

        msg.linear_acceleration_covariance = [
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        ]

        self.imu_pub.publish(msg)

    # ---------------------------------------------------------
    # CLEANUP
    # ---------------------------------------------------------

    def destroy_node(self):

        if (
            hasattr(self, 'serial')
            and self.serial.is_open
        ):
            self.serial.close()

        super().destroy_node()


def main(args=None):

    rclpy.init(args=args)

    node = None

    try:

        node = HiwonderIMUNode()

        rclpy.spin(node)

    except Exception:
        pass
    finally:
        if node is not None:
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
