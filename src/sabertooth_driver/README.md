# sabertooth_driver

ROS 2 driver for the **Dimension Engineering Sabertooth 2x32** dual motor controller over USB CDC ACM Plain Text protocol (`/dev/sabertooth` at 115200 baud).

## 📌 Features

* **Differential Drive Control**: Translates incoming `geometry_msgs/Twist` (`/cmd_vel`) into differential wheel drive speeds (`M1: <val>\r\n`, `M2: <val>\r\n`).
* **Live Battery Telemetry**: Periodic 1.0 Hz polling of motor battery voltage (`M1: getb\r\n`), published on `/battery_state` (`sensor_msgs/BatteryState`) and `/sabertooth/battery_voltage` (`std_msgs/Float32`).
* **0 dB Silent Idle State**: Eliminates stationary PWM chopper coil whine with deadzone thresholds.
* **Safety Watchdog**: 250ms command timeout immediately halting motor output if control stream stops.

## 🚀 Usage

```bash
# Standalone Sabertooth node
ros2 launch sabertooth_driver sabertooth.launch.py

# Combined Radio Receiver Teleop + Motor Driver
ros2 launch sabertooth_driver manual_radio_drive.launch.py
```
