# esp32_odom

High-precision wheel odometry node and FreeRTOS ESP32-S3 firmware for the **Hybrid-AMR**.

## 📌 Features

* **Firmware (`firmware/esp32_s3_encoder/esp32_s3_encoder.ino`)**: 4x quadrature hardware interrupt decoding running on dual-core ESP32-S3. Emits atomic 64-bit tick counts over high-speed serial (`/dev/amr_encoder` at 115200 baud).
* **Kinematics (`odom_node.py`)**: 2nd-order Runge-Kutta / exact circular arc kinematics with empirical skid-steer track separation (0.363 m effective track base).
* **Published Telemetry**:
  * `/odom` (`nav_msgs/Odometry`)
  * `/joint_states` (`sensor_msgs/JointState`)
  * `/tf` (`odom -> base_link`)
* **Utilities**: `arrow_teleop.py` (CLI arrow-key keyboard teleoperation).

## 🚀 Usage

```bash
# Launch odometry node
ros2 launch esp32_odom odom.launch.py

# Run CLI arrow-key teleoperation
ros2 run esp32_odom arrow_teleop
```
