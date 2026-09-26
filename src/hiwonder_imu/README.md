# hiwonder_imu

ROS 2 driver for the **Hiwonder 9-DOF IMU Module** over serial (`/dev/hiwonder_imu` at 9600 baud).

## 📌 Features

* Continuous acquisition of 3-axis accelerometer, 3-axis gyroscope, and 3-axis magnetometer measurements.
* Published Topics:
  * `/hiwonder/imu/data_raw` (`sensor_msgs/Imu`): Linear acceleration and angular velocity with covariance.
  * `/hiwonder/imu/mag` (`sensor_msgs/MagneticField`): Calibrated magnetic field vector in Tesla.

## 🚀 Usage

```bash
ros2 launch hiwonder_imu hiwonder_imu.launch.py
```

## 🛠️ Calibration Utilities

Calibration scripts are available in the workspace `scripts/` directory:
* `scripts/calibrate_imu.py`: Accelerometer and gyroscope bias calibration.
* `scripts/find_north.py`: Magnetometer alignment and magnetic declination calculation.
