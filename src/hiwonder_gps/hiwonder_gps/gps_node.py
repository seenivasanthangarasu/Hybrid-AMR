#!/usr/bin/env python3

import os
import time
import math
import serial

import rclpy
from rclpy.node import Node

from sensor_msgs.msg import NavSatFix
from sensor_msgs.msg import NavSatStatus
from std_msgs.msg import String


class HiwonderGpsNode(Node):

    def __init__(self):
        super().__init__('hiwonder_gps_node')

        # ROS parameters
        self.declare_parameter('port', '/dev/hiwonder_gps')
        self.declare_parameter('baud_rate', 9600)
        self.declare_parameter('frame_id', 'gps_link')

        self.configured_port = self.get_parameter('port').value
        self.baud_rate = self.get_parameter('baud_rate').value
        self.frame_id = self.get_parameter('frame_id').value
        self.port = self.configured_port

        # Publishers
        self.fix_pub = self.create_publisher(
            NavSatFix,
            '/hiwonder/gps/fix',
            10
        )

        self.nmea_pub = self.create_publisher(
            String,
            '/hiwonder/gps/nmea',
            10
        )

        # Serial connection state
        self.serial_port = None
        self.last_reconnect_time = 0.0
        self.connect_serial()

        # Read GPS at 20 Hz
        self.timer = self.create_timer(
            0.05,
            self.read_gps
        )

        self.get_logger().info(
            f'Hiwonder GPS node initialized (target: {self.configured_port} @ {self.baud_rate} baud)'
        )

    def connect_serial(self):
        """Open the GPS serial port from configured path or fallback candidate ports."""
        candidate_ports = [
            self.configured_port,
            '/dev/hiwonder_gps',
            '/dev/amr_gps',
            '/dev/gps',
            '/dev/ttyUSB3',
            '/dev/ttyUSB2',
            '/dev/ttyUSB0',
            '/dev/ttyUSB1'
        ]
        
        ports_to_try = []
        for p in candidate_ports:
            if p and p not in ports_to_try and os.path.exists(p):
                ports_to_try.append(p)

        for p in ports_to_try:
            try:
                self.serial_port = serial.Serial(
                    port=p,
                    baudrate=self.baud_rate,
                    timeout=0.1
                )
                self.port = p
                self.get_logger().info(f'Connected to GPS on {p} @ {self.baud_rate} baud')
                return True
            except Exception as e:
                self.get_logger().warn(f'Candidate GPS port {p} open failed: {e}', throttle_duration_sec=5.0)

        self.serial_port = None
        self.get_logger().warn(f'No accessible GPS serial port found among candidates: {ports_to_try}', throttle_duration_sec=5.0)
        return False

    def read_gps(self):
        """Read and process available NMEA sentences."""
        if not self.serial_port or not self.serial_port.is_open:
            now = time.time()
            if now - self.last_reconnect_time > 2.0:
                self.last_reconnect_time = now
                self.connect_serial()
            return

        try:
            while self.serial_port and self.serial_port.is_open and self.serial_port.in_waiting:
                raw_bytes = self.serial_port.readline()
                if not raw_bytes:
                    break

                line = raw_bytes.decode('ascii', errors='ignore').strip()
                if not line or not line.startswith('$'):
                    continue

                # Publish raw NMEA
                nmea_msg = String()
                nmea_msg.data = line
                self.nmea_pub.publish(nmea_msg)

                # Process GGA position data
                if line.startswith('$GNGGA') or line.startswith('$GPGGA'):
                    self.process_gga(line)

        except serial.SerialException as e:
            self.get_logger().warn(f'GPS serial connection lost on {self.port}: {e}. Reconnecting...', throttle_duration_sec=5.0)
            try:
                if self.serial_port:
                    self.serial_port.close()
            except Exception:
                pass
            self.serial_port = None
        except Exception as e:
            self.get_logger().warn(f'GPS read error: {e}', throttle_duration_sec=2.0)

    def process_gga(self, sentence):
        """Parse GNGGA/GPGGA sentence."""
        try:
            data = sentence.split('*')[0]
            fields = data.split(',')

            if len(fields) < 10:
                return

            utc_time = fields[1]
            latitude = fields[2]
            lat_direction = fields[3]
            longitude = fields[4]
            lon_direction = fields[5]
            fix_quality = fields[6]
            satellites = fields[7]
            hdop = fields[8]
            altitude = fields[9]

            if not latitude or not longitude or fix_quality == '0':
                return

            lat = self.nmea_to_decimal(latitude, lat_direction)
            lon = self.nmea_to_decimal(longitude, lon_direction)

            if lat is None or lon is None:
                return

            msg = NavSatFix()
            msg.header.stamp = self.get_clock().now().to_msg()
            msg.header.frame_id = self.frame_id
            msg.status.status = NavSatStatus.STATUS_FIX
            msg.status.service = NavSatStatus.SERVICE_GPS

            msg.latitude = lat
            msg.longitude = lon

            if altitude:
                try:
                    msg.altitude = float(altitude)
                except ValueError:
                    msg.altitude = math.nan
            else:
                msg.altitude = math.nan

            if hdop:
                try:
                    hdop_value = float(hdop)
                    variance = (hdop_value * 2.5) ** 2
                    msg.position_covariance[0] = variance
                    msg.position_covariance[4] = variance
                    msg.position_covariance[8] = variance * 2.0
                    msg.position_covariance_type = NavSatFix.COVARIANCE_TYPE_APPROXIMATED
                except ValueError:
                    msg.position_covariance_type = NavSatFix.COVARIANCE_TYPE_UNKNOWN
            else:
                msg.position_covariance_type = NavSatFix.COVARIANCE_TYPE_UNKNOWN

            self.fix_pub.publish(msg)
            self.get_logger().info(
                f'GPS FIX: lat={lat:.7f}, lon={lon:.7f}, alt={msg.altitude:.2f}m, sats={satellites}, hdop={hdop}',
                throttle_duration_sec=5.0
            )

        except Exception as e:
            self.get_logger().warn(f'Invalid GGA sentence: {e}', throttle_duration_sec=5.0)

    @staticmethod
    def nmea_to_decimal(value, direction):
        """Convert NMEA DDMM.MMMM / DDDMM.MMMM to decimal degrees."""
        try:
            if not value or not direction:
                return None
            raw = float(value)
            degrees = int(raw / 100)
            minutes = raw - (degrees * 100)
            decimal = degrees + (minutes / 60.0)
            if direction in ('S', 'W'):
                decimal *= -1
            return decimal
        except ValueError:
            return None


def main(args=None):
    rclpy.init(args=args)
    node = HiwonderGpsNode()
    try:
        rclpy.spin(node)
    except Exception:
        pass
    finally:
        if node.serial_port is not None:
            try:
                node.serial_port.close()
            except Exception:
                pass
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
