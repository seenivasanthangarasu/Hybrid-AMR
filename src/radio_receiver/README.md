# radio_receiver

Hardware GPIO pulse-width capture and manual teleoperation driver for the **HOT RC DS-600** transmitter on Qualcomm TLMM GPIO.

## 📌 Features

* **Direct GPIO Pulse Measurement**: Uses Linux `libgpiod` on `gpiochip4` to measure microsecond pulse widths on Qualcomm TLMM GPIO8 (Board Pin 11 / CH1 Steering) and GPIO24 (Board Pin 13 / CH2 Throttle).
* **Anti-Jitter Filtering**: 90% Exponential Moving Average (EMA) low-pass filter and slew-rate limiter.
* **Failsafe**: 350ms signal loss watchdog automatically commanding zero velocity if radio signal drops.
* **Published Telemetry**:
  * `/radio/channels` (`sensor_msgs/Joy`)
  * `/radio/status` (`std_msgs/String`)
  * `/radio/cmd_vel` & `/cmd_vel` (`geometry_msgs/Twist`)

## 🚀 Usage

```bash
ros2 launch radio_receiver radio_receiver.launch.py
```
