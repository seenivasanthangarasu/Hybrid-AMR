#!/usr/bin/env python3
"""
Sabertooth Motor Controller ROS 2 Node for Dimension Engineering Sabertooth 2x32
Platform: ROS 2 Jazzy
Hardware Port: /dev/sabertooth -> /dev/ttyACM0 (CDC ACM USB)
"""

import os
import time
import math
import re
import serial
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from std_msgs.msg import String, Float32
from sensor_msgs.msg import BatteryState


class SabertoothNode(Node):

    def __init__(self):
        super().__init__('sabertooth_node')

        # -----------------------------
        # Parameters
        # -----------------------------
        self.declare_parameter('port', '/dev/sabertooth')
        self.declare_parameter('baudrate', 115200)
        self.declare_parameter('address', 128)
        self.declare_parameter('cmd_vel_topic', '/cmd_vel')
        self.declare_parameter('wheel_track', 0.35)        # Wheel separation in meters
        self.declare_parameter('max_linear_speed', 1.2)   # m/s
        self.declare_parameter('max_angular_speed', 2.0)  # rad/s
        self.declare_parameter('max_motor_power', 2047)   # Sabertooth 2x32 full resolution: 2047
        self.declare_parameter('invert_left', False)
        self.declare_parameter('invert_right', False)
        self.declare_parameter('watchdog_timeout_sec', 0.25)
        self.declare_parameter('control_rate_hz', 50.0)
        self.declare_parameter('protocol', 'usb_describe') # 'usb_describe' or 'packet_serial'
        self.declare_parameter('battery_query_rate_hz', 1.0)

        self.configured_port = self.get_parameter('port').value
        self.baudrate = self.get_parameter('baudrate').value
        self.address = self.get_parameter('address').value
        self.cmd_vel_topic = self.get_parameter('cmd_vel_topic').value
        self.wheel_track = self.get_parameter('wheel_track').value
        self.max_lin = self.get_parameter('max_linear_speed').value
        self.max_ang = self.get_parameter('max_angular_speed').value
        self.max_power = self.get_parameter('max_motor_power').value
        self.inv_left = self.get_parameter('invert_left').value
        self.inv_right = self.get_parameter('invert_right').value
        self.watchdog_timeout = self.get_parameter('watchdog_timeout_sec').value
        self.control_rate = self.get_parameter('control_rate_hz').value
        self.protocol = self.get_parameter('protocol').value
        self.battery_query_rate = float(self.get_parameter('battery_query_rate_hz').value)
        self.battery_query_interval = 1.0 / max(0.1, self.battery_query_rate)

        # -----------------------------
        # State
        # -----------------------------
        self.ser = None
        self.port = self.configured_port
        self.last_reconnect_attempt = 0.0
        self._rx_buffer = ""

        self.target_v = 0.0
        self.target_w = 0.0
        self.last_cmd_time = 0.0

        self.left_motor_cmd = 0
        self.right_motor_cmd = 0
        self.is_stopped = True

        self.battery_voltage = None
        self.motor_current = None
        self.driver_temp = None
        self.last_battery_query_time = 0.0

        # -----------------------------
        # Subscribers & Publishers
        # -----------------------------
        self.sub_cmd_vel = self.create_subscription(
            Twist,
            self.cmd_vel_topic,
            self._cmd_vel_callback,
            10
        )
        self.pub_status = self.create_publisher(String, '/sabertooth/status', 10)
        self.pub_battery_state = self.create_publisher(BatteryState, '/battery_state', 10)
        self.pub_battery_voltage = self.create_publisher(Float32, '/sabertooth/battery_voltage', 10)

        # Establish serial connection safely
        self._connect_serial()

        # Control & Watchdog loop
        timer_dt = 1.0 / self.control_rate
        self.timer = self.create_timer(timer_dt, self._control_loop)

        self.get_logger().info(
            f"Sabertooth Node started (port={self.port}, protocol={self.protocol}, topic={self.cmd_vel_topic})"
        )

    def _connect_serial(self):
        candidate_ports = [
            self.configured_port,
            '/dev/sabertooth',
            '/dev/amr_motors',
            '/dev/ttyACM0',
            '/dev/ttyACM1',
            '/dev/ttyUSB4'
        ]
        unique_ports = []
        for p in candidate_ports:
            if p and p not in unique_ports:
                unique_ports.append(p)

        for p in unique_ports:
            if os.path.exists(p):
                try:
                    self.ser = serial.Serial(p, self.baudrate, timeout=0.05)
                    self.port = p
                    # Send safe zero commands immediately
                    self._send_stop()
                    self.get_logger().info(f"Connected to Sabertooth 2x32 on {p} @ {self.baudrate} baud")
                    return True
                except Exception as e:
                    self.get_logger().warn(f"Failed to open {p}: {e}", throttle_duration_sec=3.0)

        self.get_logger().warn(f"No accessible Sabertooth serial port found among: {unique_ports}", throttle_duration_sec=5.0)
        return False

    def _cmd_vel_callback(self, msg: Twist):
        # Validate input against NaN or Inf
        if math.isnan(msg.linear.x) or math.isnan(msg.angular.z) or \
           math.isinf(msg.linear.x) or math.isinf(msg.angular.z):
            self.get_logger().warn("Received invalid NaN/Inf in Twist command. Halting motors.", throttle_duration_sec=2.0)
            self.target_v = 0.0
            self.target_w = 0.0
            return

        v = msg.linear.x
        w = msg.angular.z

        # Software deadzone to reject sub-threshold teleop jitter
        if abs(v) < 0.02:
            v = 0.0
        if abs(w) < 0.03:
            w = 0.0

        self.target_v = max(-self.max_lin, min(self.max_lin, v))
        self.target_w = max(-self.max_ang, min(self.max_ang, w))
        self.last_cmd_time = time.time()

    def _control_loop(self):
        now = time.time()

        # Check connection
        if not self.ser or not self.ser.is_open:
            if now - self.last_reconnect_attempt > 2.0:
                self.last_reconnect_attempt = now
                self._connect_serial()
            return

        # Periodic battery and telemetry polling (1 Hz)
        if self.ser and self.ser.is_open:
            if now - self.last_battery_query_time >= self.battery_query_interval:
                self.last_battery_query_time = now
                if self.protocol == 'usb_describe':
                    try:
                        self.ser.write(b"M1: getb\r\nM1: getc\r\nM1: gett\r\n")
                    except Exception:
                        pass

            # Read any incoming serial feedback
            self._read_serial_feedback()

        # Watchdog check: if command timeout, zero all outputs
        time_since_cmd = now - self.last_cmd_time
        if time_since_cmd > self.watchdog_timeout or self.last_cmd_time == 0.0:
            if not self.is_stopped:
                self._send_stop()
                self.is_stopped = True
            left_cmd = 0
            right_cmd = 0
        else:
            # Differential Drive Kinematics
            # v_left = v - (w * L / 2)
            # v_right = v + (w * L / 2)
            v_l = self.target_v - (self.target_w * self.wheel_track / 2.0)
            v_r = self.target_v + (self.target_w * self.wheel_track / 2.0)

            # Map velocity (m/s) to Motor Power [-max_power, max_power]
            left_ratio = v_l / self.max_lin if self.max_lin > 0 else 0.0
            right_ratio = v_r / self.max_lin if self.max_lin > 0 else 0.0

            left_ratio = max(-1.0, min(1.0, left_ratio))
            right_ratio = max(-1.0, min(1.0, right_ratio))

            if self.inv_left:
                left_ratio = -left_ratio
            if self.inv_right:
                right_ratio = -right_ratio

            left_cmd = int(left_ratio * self.max_power)
            right_cmd = int(right_ratio * self.max_power)

            # Deadband threshold on raw power to eliminate idle jitter & twitch
            if abs(left_cmd) < 35:
                left_cmd = 0
            if abs(right_cmd) < 35:
                right_cmd = 0

            # Silence coil whine and eliminate idle jerk: Only send drive commands when non-zero, or send stop once when halting
            if left_cmd == 0 and right_cmd == 0:
                if not self.is_stopped:
                    self._send_stop()
                    self.is_stopped = True
            else:
                self._send_motor_commands(left_cmd, right_cmd)
                self.is_stopped = False

        self.left_motor_cmd = left_cmd
        self.right_motor_cmd = right_cmd

        # Status Publisher
        status_msg = String()
        bat_str = f"{self.battery_voltage:.1f}V" if self.battery_voltage is not None else "N/A"
        status_msg.data = (
            f"port={self.port}, online={self.ser is not None and self.ser.is_open}, "
            f"battery={bat_str}, "
            f"watchdog_ok={time_since_cmd <= self.watchdog_timeout}, "
            f"target_v={self.target_v:.2f}m/s, target_w={self.target_w:.2f}rad/s, "
            f"left_power={left_cmd}, right_power={right_cmd}"
        )
        self.pub_status.publish(status_msg)

    def _read_serial_feedback(self):
        if not self.ser or not self.ser.is_open:
            return
        try:
            if self.ser.in_waiting > 0:
                raw = self.ser.read(self.ser.in_waiting).decode('ascii', errors='ignore')
                self._rx_buffer += raw
                if '\n' in self._rx_buffer or '\r' in self._rx_buffer:
                    lines = re.split(r'[\r\n]+', self._rx_buffer)
                    self._rx_buffer = lines[-1]
                    updated = False
                    for line in lines[:-1]:
                        line = line.strip()
                        if not line:
                            continue
                        match_b = re.search(r'(?:M\d+:)?B\s*([+-]?\d+)', line, re.IGNORECASE)
                        if match_b:
                            self.battery_voltage = round(int(match_b.group(1)) / 10.0, 1)
                            updated = True
                        match_c = re.search(r'(?:M\d+:)?C\s*([+-]?\d+)', line, re.IGNORECASE)
                        if match_c:
                            self.motor_current = round(int(match_c.group(1)) / 10.0, 1)
                            updated = True
                        match_t = re.search(r'(?:M\d+:)?T\s*([+-]?\d+)', line, re.IGNORECASE)
                        if match_t:
                            self.driver_temp = round(float(match_t.group(1)), 1)
                            updated = True

                    if updated:
                        self._publish_battery_telemetry()
        except Exception as e:
            self.get_logger().debug(f"Serial RX read error: {e}")

    def _publish_battery_telemetry(self):
        if self.battery_voltage is None:
            return

        # 1. sensor_msgs/BatteryState -> /battery_state
        bs = BatteryState()
        bs.header.stamp = self.get_clock().now().to_msg()
        bs.header.frame_id = 'base_link'
        bs.voltage = float(self.battery_voltage)
        if self.motor_current is not None:
            bs.current = float(self.motor_current)
        if self.driver_temp is not None:
            bs.temperature = float(self.driver_temp)
        bs.present = True
        bs.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_DISCHARGING
        bs.power_supply_health = BatteryState.POWER_SUPPLY_HEALTH_GOOD
        bs.power_supply_technology = BatteryState.POWER_SUPPLY_TECHNOLOGY_LION
        self.pub_battery_state.publish(bs)

        # 2. std_msgs/Float32 -> /sabertooth/battery_voltage
        v_msg = Float32()
        v_msg.data = float(self.battery_voltage)
        self.pub_battery_voltage.publish(v_msg)

    def _send_motor_commands(self, left_power: int, right_power: int):
        if not self.ser or not self.ser.is_open:
            return

        try:
            if self.protocol == 'usb_describe':
                # Plain Text DEScribe protocol (Native USB CDC ACM on Sabertooth 2x32)
                # Format: M1:<power>\r\nM2:<power>\r\n (-2047 to 2047)
                cmd = f"M1:{left_power}\r\nM2:{right_power}\r\n"
                self.ser.write(cmd.encode('ascii'))
            elif self.protocol == 'packet_serial':
                # Standard Dimension Engineering Packetized Serial
                # Motor 1: Cmd 0 (Fwd), Cmd 1 (Rev) [0-127]
                # Motor 2: Cmd 4 (Fwd), Cmd 5 (Rev) [0-127]
                p1 = int((left_power / self.max_power) * 127)
                p2 = int((right_power / self.max_power) * 127)

                # Motor 1
                cmd1 = 0 if p1 >= 0 else 1
                val1 = min(127, abs(p1))
                chk1 = (self.address + cmd1 + val1) & 0x7F
                self.ser.write(bytes([self.address, cmd1, val1, chk1]))

                # Motor 2
                cmd2 = 4 if p2 >= 0 else 5
                val2 = min(127, abs(p2))
                chk2 = (self.address + cmd2 + val2) & 0x7F
                self.ser.write(bytes([self.address, cmd2, val2, chk2]))
        except Exception as e:
            self.get_logger().warn(f"Serial TX error: {e}. Marking connection lost.", throttle_duration_sec=2.0)
            try:
                self.ser.close()
            except Exception:
                pass
            self.ser = None

    def _send_stop(self):
        if not self.ser or not self.ser.is_open:
            return
        try:
            if self.protocol == 'usb_describe':
                self.ser.write(b"M1: 0\r\nM2: 0\r\n")
            elif self.protocol == 'packet_serial':
                # M1 stop
                chk1 = (self.address + 0 + 0) & 0x7F
                self.ser.write(bytes([self.address, 0, 0, chk1]))
                # M2 stop
                chk2 = (self.address + 4 + 0) & 0x7F
                self.ser.write(bytes([self.address, 4, 0, chk2]))
        except Exception:
            pass

    def destroy_node(self):
        self.get_logger().info("Shutting down Sabertooth Node - Sending STOP to motors.")
        self._send_stop()
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = SabertoothNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
        pass
    except Exception as e:
        if rclpy.ok():
            node.get_logger().error(f"Fatal error in Sabertooth Node: {e}")
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
