#!/usr/bin/env python3
"""
Radio Receiver ROS 2 Node for HOT RC DS-600 FA-06
Hardware:
  - CH1 (Steering) -> Board Pin 11 -> Qualcomm GPIO8
  - CH2 (Throttle) -> Board Pin 13 -> Qualcomm GPIO24
Platform: ROS 2 Jazzy on Qualcomm TLMM (gpiochip4)
"""

import time
import threading
import select
import rclpy
from rclpy.node import Node

import gpiod
from geometry_msgs.msg import Twist
from sensor_msgs.msg import Joy
from std_msgs.msg import String


class RadioReceiverNode(Node):

    def __init__(self):
        super().__init__('radio_receiver_node')

        # -----------------------------
        # Parameter Declarations
        # -----------------------------
        self.declare_parameter('gpio_chip', 'gpiochip4')
        self.declare_parameter('ch1_gpio', 8)
        self.declare_parameter('ch2_gpio', 24)

        # Calibrated values for HOT RC DS-600 FA-06
        self.declare_parameter('ch1_min_us', 800.0)
        self.declare_parameter('ch1_neutral_us', 1494.0)
        self.declare_parameter('ch1_max_us', 2200.0)
        self.declare_parameter('ch1_deadband_us', 35.0)
        self.declare_parameter('ch1_invert', False)

        self.declare_parameter('ch2_min_us', 870.0)
        self.declare_parameter('ch2_neutral_us', 1904.0)
        self.declare_parameter('ch2_max_us', 2200.0)
        self.declare_parameter('ch2_deadband_us', 35.0)
        self.declare_parameter('ch2_invert', False)

        self.declare_parameter('max_linear_speed', 1.0)    # m/s
        self.declare_parameter('max_angular_speed', 1.8)   # rad/s
        self.declare_parameter('signal_timeout_sec', 0.35) # Failsafe timeout
        self.declare_parameter('publish_rate_hz', 50.0)
        self.declare_parameter('cmd_vel_topic', '/cmd_vel')
        self.declare_parameter('enable_cmd_vel_pub', True)

        # Fetch Parameters
        self.gpio_chip_name = self.get_parameter('gpio_chip').value
        self.ch1_pin = self.get_parameter('ch1_gpio').value
        self.ch2_pin = self.get_parameter('ch2_gpio').value

        self.ch1_min = self.get_parameter('ch1_min_us').value
        self.ch1_neutral = self.get_parameter('ch1_neutral_us').value
        self.ch1_max = self.get_parameter('ch1_max_us').value
        self.ch1_deadband = self.get_parameter('ch1_deadband_us').value
        self.ch1_invert = self.get_parameter('ch1_invert').value

        self.ch2_min = self.get_parameter('ch2_min_us').value
        self.ch2_neutral = self.get_parameter('ch2_neutral_us').value
        self.ch2_max = self.get_parameter('ch2_max_us').value
        self.ch2_deadband = self.get_parameter('ch2_deadband_us').value
        self.ch2_invert = self.get_parameter('ch2_invert').value

        self.max_lin = self.get_parameter('max_linear_speed').value
        self.max_ang = self.get_parameter('max_angular_speed').value
        self.signal_timeout = self.get_parameter('signal_timeout_sec').value
        self.pub_rate = self.get_parameter('publish_rate_hz').value
        self.cmd_vel_topic = self.get_parameter('cmd_vel_topic').value
        self.enable_cmd_vel = self.get_parameter('enable_cmd_vel_pub').value

        # -----------------------------
        # Publishers
        # -----------------------------
        self.pub_joy = self.create_publisher(Joy, '/radio/channels', 10)
        self.pub_status = self.create_publisher(String, '/radio/status', 10)
        self.pub_radio_twist = self.create_publisher(Twist, '/radio/cmd_vel', 10)

        if self.enable_cmd_vel:
            self.pub_cmd_vel = self.create_publisher(Twist, self.cmd_vel_topic, 10)
        else:
            self.pub_cmd_vel = None

        # -----------------------------
        # State Variables
        # -----------------------------
        self.lock = threading.Lock()
        self.ch1_raw_us = self.ch1_neutral
        self.ch2_raw_us = self.ch2_neutral
        self.ch1_last_update = 0.0
        self.ch2_last_update = 0.0
        self.pulse_count_ch1 = 0
        self.pulse_count_ch2 = 0

        self.running = True

        # Start GPIO Background Thread
        self.gpio_thread = threading.Thread(target=self._gpio_monitor_loop, daemon=True)
        self.gpio_thread.start()

        # Publish Timer (50 Hz)
        timer_period = 1.0 / self.pub_rate
        self.timer = self.create_timer(timer_period, self._publish_callback)

        self.get_logger().info(
            f"Radio Receiver Node initialized on {self.gpio_chip_name} "
            f"(CH1=GPIO{self.ch1_pin}, CH2=GPIO{self.ch2_pin})"
        )

    def _normalize_channel(self, raw_us, min_us, neutral_us, max_us, deadband_us, invert):
        """Normalize raw pulse width (us) to [-1.0, 1.0] with neutral deadband."""
        if abs(raw_us - neutral_us) <= deadband_us:
            return 0.0

        if raw_us > neutral_us + deadband_us:
            span = max_us - (neutral_us + deadband_us)
            val = (raw_us - (neutral_us + deadband_us)) / span if span > 0 else 0.0
        else:
            span = (neutral_us - deadband_us) - min_us
            val = (raw_us - (neutral_us - deadband_us)) / span if span > 0 else 0.0

        val = max(-1.0, min(1.0, val))
        return -val if invert else val

    def _gpio_monitor_loop(self):
        """Continuously monitor GPIO edges using Linux libgpiod character device."""
        while self.running and rclpy.ok():
            try:
                chip = gpiod.Chip(self.gpio_chip_name)
                line1 = chip.get_line(self.ch1_pin)
                line2 = chip.get_line(self.ch2_pin)

                line1.request(consumer='radio_rx_ch1', type=gpiod.LINE_REQ_EV_BOTH_EDGES)
                line2.request(consumer='radio_rx_ch2', type=gpiod.LINE_REQ_EV_BOTH_EDGES)

                fd1 = line1.event_get_fd()
                fd2 = line2.event_get_fd()

                poller = select.poll()
                poller.register(fd1, select.POLLIN)
                poller.register(fd2, select.POLLIN)

                ch1_rise = None
                ch2_rise = None

                self.get_logger().info("GPIO edge monitoring started successfully.")

                while self.running and rclpy.ok():
                    events = poller.poll(100) # 100ms poll timeout
                    for fd, _ in events:
                        if fd == fd1:
                            e = line1.event_read()
                            ts = e.sec + (e.nsec / 1e9)
                            if e.type == gpiod.LineEvent.RISING_EDGE:
                                ch1_rise = ts
                            elif e.type == gpiod.LineEvent.FALLING_EDGE and ch1_rise is not None:
                                width = (ts - ch1_rise) * 1e6
                                if 600 < width < 2500:
                                    with self.lock:
                                        self.ch1_raw_us = width
                                        self.ch1_last_update = time.time()
                                        self.pulse_count_ch1 += 1
                        elif fd == fd2:
                            e = line2.event_read()
                            ts = e.sec + (e.nsec / 1e9)
                            if e.type == gpiod.LineEvent.RISING_EDGE:
                                ch2_rise = ts
                            elif e.type == gpiod.LineEvent.FALLING_EDGE and ch2_rise is not None:
                                width = (ts - ch2_rise) * 1e6
                                if 600 < width < 2500:
                                    with self.lock:
                                        self.ch2_raw_us = width
                                        self.ch2_last_update = time.time()
                                        self.pulse_count_ch2 += 1

                line1.release()
                line2.release()
                chip.close()

            except Exception as e:
                self.get_logger().warn(f"GPIO monitor error: {e}. Retrying in 1.0s...", throttle_duration_sec=3.0)
                time.sleep(1.0)

    def _publish_callback(self):
        now_time = time.time()
        with self.lock:
            ch1_raw = self.ch1_raw_us
            ch2_raw = self.ch2_raw_us
            dt1 = now_time - self.ch1_last_update
            dt2 = now_time - self.ch2_last_update

        # Failsafe check
        signal_valid = (dt1 < self.signal_timeout) and (dt2 < self.signal_timeout)
        failsafe_active = not signal_valid

        # Normalize channels
        if signal_valid:
            norm_ch1 = self._normalize_channel(
                ch1_raw, self.ch1_min, self.ch1_neutral, self.ch1_max, self.ch1_deadband, self.ch1_invert
            )
            norm_ch2 = self._normalize_channel(
                ch2_raw, self.ch2_min, self.ch2_neutral, self.ch2_max, self.ch2_deadband, self.ch2_invert
            )
        else:
            norm_ch1 = 0.0
            norm_ch2 = 0.0

        # Create Joy Message
        joy_msg = Joy()
        joy_msg.header.stamp = self.get_clock().now().to_msg()
        joy_msg.header.frame_id = 'radio_receiver'
        # axes: [ch1_steering, ch2_throttle, ch1_raw_us, ch2_raw_us]
        joy_msg.axes = [float(norm_ch1), float(norm_ch2), float(ch1_raw), float(ch2_raw)]
        joy_msg.buttons = [1 if signal_valid else 0, 1 if failsafe_active else 0]
        self.pub_joy.publish(joy_msg)

        # Create Twist Message
        # CH2 -> Linear velocity (Forward / Reverse)
        # CH1 -> Angular velocity (Left / Right turn: steering left gives positive yaw rate in ROS standard)
        twist_msg = Twist()
        if signal_valid:
            twist_msg.linear.x = float(norm_ch2 * self.max_lin)
            twist_msg.angular.z = float(-norm_ch1 * self.max_ang)
        else:
            twist_msg.linear.x = 0.0
            twist_msg.angular.z = 0.0

        self.pub_radio_twist.publish(twist_msg)

        if self.pub_cmd_vel is not None:
            self.pub_cmd_vel.publish(twist_msg)

        # Create Status Message
        status_msg = String()
        status_msg.data = (
            f"signal_valid={signal_valid}, failsafe={failsafe_active}, "
            f"CH1_raw={ch1_raw:.1f}us (norm={norm_ch1:+.2f}), "
            f"CH2_raw={ch2_raw:.1f}us (norm={norm_ch2:+.2f}), "
            f"linear_x={twist_msg.linear.x:.2f}m/s, angular_z={twist_msg.angular.z:.2f}rad/s"
        )
        self.pub_status.publish(status_msg)

    def destroy_node(self):
        self.running = False
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = RadioReceiverNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
        pass
    except Exception as e:
        if rclpy.ok():
            node.get_logger().error(f"Unexpected error: {e}")
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
