# Hybrid AMR (Autonomous Mobile Robot)

A production-grade, full-stack **ROS 2 Jazzy** autonomous mobile robot platform designed for hybrid indoor and outdoor navigation, running on **Ubuntu 24.04 LTS (arm64)** on the **Rubik Pi** single-board computer. 

Featuring dual-stage Extended Kalman Filter (EKF) sensor fusion, autonomous outdoor GPS waypoint navigation, 2D SLAM mapping, Sabertooth 2x32 motor driver integration with live battery telemetry, HOT RC DS-600 radio teleoperation via direct Qualcomm GPIO, ESP32-S3 4x quadrature wheel odometry, YDLIDAR G4 12 Hz laser scanning, and a modern real-time onboard Web Admin & Diagnostics Dashboard (React 18 + Vite + Flask).

![ROS 2 Jazzy](https://img.shields.io/badge/ROS_2-Jazzy%20Jalisco-blue)
![OS](https://img.shields.io/badge/OS-Ubuntu%2024.04%20LTS%20arm64-orange)
![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite%20%2B%20Tailwind-61dafb)
![Backend](https://img.shields.io/badge/Backend-Flask%20%2B%20ROSBridge-green)
![License](https://img.shields.io/badge/License-MIT-purple)
![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen)

---

## 🌟 Key Features & Architecture

```
                                      +---------------------------------------------+
                                      |            Remote Operator (LAN)            |
                                      |      http://<ROBOT_IP>:3000 (React UI)      |
                                      +------+-------------------------------+------+
                                             |                               |
                       REST API (HTTP) :5001 |                               | WebSocket (JSON) :9090
                                             v                               v
                     +-----------------------------------+   +------------------------------------+
                     |      Flask Backend Server         |   |          ROSBridge Server          |
                     |     (admin-dashboard/server)      |   |     (rosbridge_websocket :9090)    |
                     +-----------------+-----------------+   +-----------------+------------------+
                                       |                                       |
                                       v                                       v
+-------------------------------------------------------------------------------------------------------------------------+
|                                                  ROS 2 JAZZY CORE STACK                                                 |
|                                                                                                                         |
|  +---------------------------+   +---------------------------+   +---------------------------+   +-------------------+  |
|  |     robot_localization    |   |     outdoor_navigation    |   |       slam_toolbox        |   | amr_data_recorder |  |
|  | * Stage 1: EKF Local      |   | * WGS-84 Geodesy (ENU)    |   | * 2D SLAM Mapping         |   | * Synchronized    |  |
|  |   (Odom + IMU -> /odom_f) |   | * Waypoint State Machine  |   | * Ceres Scan Matcher      |   |   MCAP Bagging    |  |
|  | * Stage 2: EKF Global     |   | * LiDAR Obstacle Stop     |   | * Localization Mode       |   | * Experiment      |  |
|  |   (/odom_f + GPS -> /glob)|   | * Dynamic Speed Scaling   |   |   (/map -> /odom)         |   |   metadata.yaml   |  |
|  +---------------------------+   +---------------------------+   +---------------------------+   +-------------------+  |
|                                                                                                                         |
|  +---------------------------+   +---------------------------+   +---------------------------+   +-------------------+  |
|  |     sabertooth_driver     |   |       radio_receiver      |   |         esp32_odom        |   | ydlidar_driver    |  |
|  | * Plain Text CDC ACM      |   | * Qualcomm TLMM GPIO      |   | * ESP32-S3 4x Quad Ticks  |   | * YDLIDAR G4      |  |
|  | * Differential /cmd_vel   |   |   (CH1=GPIO8, CH2=GPIO24) |   | * Exact Arc Kinematics    |   | * 12.0 Hz Scan    |  |
|  | * Live Battery Telemetry  |   | * Low-Pass EMA & Slew Clam|   | * Monotonic Timestamps    |   | * 9 kHz Sampling  |  |
|  | * 0 dB Silent Idle State  |   | * 350ms Failsafe Watchdog |   | * Auto-Reconnection       |   | * Auto-Resync     |  |
|  +---------------------------+   +---------------------------+   +---------------------------+   +-------------------+  |
+-------------------------------------------------------------------------------------------------------------------------+
                                                               |
                                                               v
+-------------------------------------------------------------------------------------------------------------------------+
|                                                    PHYSICAL HARDWARE                                                    |
|                                                                                                                         |
|  [Sabertooth 2x32 Controller]    [HOT RC DS-600 Receiver]    [ESP32-S3 Optical Encoders]     [YDLIDAR G4 Scanner]       |
|  `/dev/sabertooth` (115200)      `gpiochip4` (Lines 8 & 24)  `/dev/amr_encoder` (115200)     `/dev/amr_lidar` (230400)  |
|                                                                                                                         |
|  [Hiwonder 9-DOF IMU]            [Hiwonder GNSS GPS]         [Intel RealSense D435i / USB Cam]                          |
|  `/dev/hiwonder_imu` (9600)      `/dev/hiwonder_gps` (9600)  `/dev/video4` (424x240 @ 15 FPS)                           |
+-------------------------------------------------------------------------------------------------------------------------+
```

---

## 🚀 System Capabilities

### 1. 🌐 Outdoor Autonomous GPS Waypoint Navigation (`outdoor_navigation`)
* **WGS-84 Ellipsoid Geodesy**: Real-time East-North-Up (ENU) tangent-plane projection, Haversine geodesic distance calculation, and Great Circle bearing computations.
* **Deterministic State Machine**: Managed lifecycle (`IDLE`, `WAITING_FOR_GPS`, `WAITING_FOR_VALID_GOAL`, `NAVIGATING`, `OBSTACLE_STOP`, `GPS_LOST`, `GOAL_REACHED`, `ERROR`, `STOPPED`).
* **Active Safety & Collision Avoidance**: Real-time forward-arc LiDAR obstacle detection with automatic deceleration and emergency braking at configurable margins.
* **Manual Override & Failsafe**: Immediate priority preemption upon radio transmitter input and command zeroing on GPS signal loss.

### 2. 🧭 Dual-Stage Sensor Fusion (`robot_localization`)
* **Stage 1 (Local Odometry - `ekf_local.yaml`)**: Fuses high-rate wheel odometry (`/odom`) with Hiwonder 9-DOF IMU angular velocities and accelerations (`/hiwonder/imu/data_raw`) to publish continuous, drift-compensated `odom -> base_link` transforms and `/odometry/filtered`.
* **Stage 2 (Global Localization - `ekf_global.yaml` & `navsat_transform.yaml`)**: Fuses `/odometry/filtered` with Hiwonder GNSS GPS coordinates (`/hiwonder/gps/fix`) converted into UTM/ENU odometry, providing continuous earth-frame positioning (`map -> odom` TF and `/odometry/global`).

### 3. 🗺️ 2D SLAM Mapping & Localization (`rock_bringup` / `indoor_amr`)
* **SLAM Toolbox Integration**: Optimized Ceres scan matching parameters (`mapper_mapping.yaml`) with active barycenter centroid tracking (`use_scan_barycenter: true`) for robust loop-closure in dynamic indoor environments.
* **Saved Map Localization**: Seamless transition into AMCL-like pose tracking against saved occupancy grids.

### 4. ⚡ Sabertooth 2x32 Motor Driver & Live Battery Telemetry (`sabertooth_driver`)
* **USB CDC ACM Plain Text Protocol**: Direct high-speed serial communication on `/dev/sabertooth` (115200 baud).
* **Live Battery Telemetry**: 1.0 Hz periodic polling of battery voltage (`M1: getb\r\n`), publishing standard `sensor_msgs/BatteryState` on `/battery_state` and `std_msgs/Float32` on `/sabertooth/battery_voltage`.
* **0 dB Silent Idle State**: Eliminates stationary H-bridge PWM chopper coil whine and low-speed motor creep with deadzone thresholds.
* **Command Timeout Watchdog**: 250ms hardware watchdog that immediately zeros outputs if ROS 2 commands cease.

### 5. 🎮 HOT RC DS-600 Radio Teleoperation (`radio_receiver`)
* **Direct Hardware GPIO Capture**: Measures microsecond pulse widths using `libgpiod` on Qualcomm TLMM GPIO8 (Pin 11 / CH1 Steering) and GPIO24 (Pin 13 / CH2 Throttle).
* **Anti-Jitter Filtering**: 90% smoothing Exponential Moving Average (EMA) low-pass filter and slew-rate limiter to suppress Linux interrupt scheduler jitter.
* **350ms Signal Loss Watchdog**: Automatically zeroes velocity outputs if transmitter radio connection drops.

### 6. 🔄 ESP32-S3 Optical Tracked Odometry (`esp32_odom`)
* **Hardware Interrupt 4x Quadrature Decoding**: FreeRTOS atomic 64-bit tick counters running on the ESP32-S3 (`firmware/esp32_s3_encoder/esp32_s3_encoder.ino`).
* **Exact Arc Kinematics**: 2nd-order Runge-Kutta / circular arc kinematics accounting for empirical skid-steer track separation (0.363 m effective track base).
* **Auto-Reconnection**: Dynamic serial discovery and auto-recovery from transient USB bus resets.

### 7. 📡 YDLIDAR G4 2D Laser Scanner (`ydlidar_ros2_driver`)
* **High-Rate Scanning**: Configured for 12.0 Hz scan rate and 9.0 kHz sample rate at 230400 baud.
* **Stream Resynchronization**: Fixed-position byte rewind on checksum failures preventing false sync packet header loss.
* **Clean Shutdown**: POSIX signal handlers (`SIGINT`, `SIGTERM`, `SIGHUP`) assert CP2102 DTR line clearing to halt motor rotation immediately on node exit.

### 8. 💻 Web Admin & Diagnostics Dashboard (`admin-dashboard`)
* **Robot Control Panel**: Full stack bringup with animated launch stages, live streaming bringup logs, 1-click Radio Teleop & Motor Drive toggle (`[⚡ Turn ON Radio Teleop Drive]` / `[🛑 Turn OFF Radio Teleop Drive]`), and live battery indicator pill.
* **Universal Camera Streamer**: Automatic detection of Intel RealSense D435i (`/dev/video4`), generic V4L2 USB cameras, 16-bit TURBO depth maps, and Pro-Max Telemetry HUD fallback stream on `http://<ROBOT_IP>:8080`.
* **Live System & ROS 2 Diagnostics**: Real-time topic rates, TF tree staleness, node registry, CPU/RAM/Disk/Network health, and `journalctl`/ROS log viewers.

---

## 📁 Repository Structure

```
├── start_all.sh                     # Single-command startup script (ROSBridge, Flask API, Vite UI)
├── fastdds_udp.xml                  # FastDDS UDPv4 transport profile (eliminates /dev/shm mutex lockups)
├── rc_calibration_final.json        # HOT RC DS-600 radio transmitter calibration profile
├── udev_rules/
│   └── 99-amr.rules                 # Persistent udev rules for all robot sensors and motor controllers
├── scripts/
│   ├── usb_heal.sh                  # PCIe xHCI host controller auto-healer for USB error -71 recovery
│   ├── calibrate_imu.py             # IMU gyroscope and accelerometer calibration script
│   └── find_north.py                # Magnetometer true north alignment utility
├── admin-dashboard/                 # Onboard Web Admin & Diagnostics Suite (React 18 + Vite + Flask)
│   ├── src/                         # React UI Components, Hooks, and Vitest test suites
│   ├── server/                      # Local Flask REST API (Port 5001), camera streamer, and Pytest tests
│   ├── package.json
│   └── vite.config.js
└── src/                             # ROS 2 Jazzy Workspace Packages
    ├── outdoor_navigation/          # Outdoor GPS autonomous waypoint navigation state machine & geodesy
    ├── sabertooth_driver/           # Sabertooth 2x32 motor controller driver & battery telemetry
    ├── radio_receiver/              # HOT RC DS-600 GPIO pulse receiver node & manual teleop
    ├── esp32_odom/                  # ESP32-S3 wheel odometry node, params, and Arduino firmware
    ├── hiwonder_gps/                # Hiwonder GNSS GPS NMEA and NavSatFix driver
    ├── hiwonder_imu/                # Hiwonder 9-DOF IMU acceleration, angular velocity, and magnetometer driver
    ├── gogo_description/            # Robot URDF (Xacro) geometry, joint states, and TF tree definition
    ├── rock_bringup/                # Top-level bringup launch files (navigation, mapping, EKF local/global)
    ├── indoor_amr/                  # Indoor SLAM navigation launch configurations
    ├── hybrid_navigation/           # Hybrid GPS <-> SLAM state transition manager
    ├── amr_data_recorder/           # Synchronized MCAP ROS bag recorder with metadata generator
    ├── ydlidar_ros2_driver/         # YDLIDAR G4 ROS 2 driver node (12 Hz scan rate)
    ├── YDLidar-SDK/                 # Core YDLidar C++ communication library
    └── mapviz/                      # MapViz GIS satellite mapping configurations
```

---

## 🔌 Hardware Port & Udev Rule Matrix

All USB and serial devices are uniquely identified and mapped to persistent symlinks via `/etc/udev/rules.d/99-amr.rules`:

| Device / Sensor | Hardware Identifier / Port | Baudrate / Interface | Persistent Symlink | Output Topics |
|---|---|---|---|---|
| **Sabertooth 2x32 Motors** | USB CDC ACM (`0x268b:0x0201`) | 115200 baud | `/dev/sabertooth` | `/battery_state`, `/sabertooth/battery_voltage` |
| **HOT RC DS-600 Radio** | Board Pin 11 & 13 | Qualcomm TLMM GPIO 8 & 24 | `gpiochip4` | `/radio/channels`, `/radio/cmd_vel`, `/cmd_vel` |
| **ESP32-S3 Odometry** | CP2102N (`serial: a8f8c9...`) | 115200 baud | `/dev/amr_encoder` | `/odom`, `/joint_states`, `/tf` (`odom -> base_link`) |
| **YDLIDAR G4 Scanner** | CP2102 (`serial: 0001`) | 230400 baud | `/dev/amr_lidar` | `/scan` (12.0 Hz) |
| **Hiwonder GNSS GPS** | USB-Serial CH340 (`port: 1-2.2`) | 9600 baud | `/dev/hiwonder_gps` | `/hiwonder/gps/fix`, `/hiwonder/gps/nmea` |
| **Hiwonder 9-DOF IMU** | USB-Serial CH340 (`port: 1-2.3`) | 9600 baud | `/dev/hiwonder_imu` | `/hiwonder/imu/data_raw`, `/hiwonder/imu/mag` |
| **Intel RealSense D435i** | USB 3.0 (`8086:0b3a`) | V4L2 (`/dev/video4`) | `/dev/video4` | `/camera/camera/color/image_raw` |

---

## 📡 ROS 2 Topic & Service Contract

| Topic | Message Type | Description |
|---|---|---|
| `/cmd_vel` | `geometry_msgs/Twist` | Primary motor velocity commands (from teleop or autonomous navigation) |
| `/odom` | `nav_msgs/Odometry` | Raw ESP32-S3 circular arc wheel odometry |
| `/odometry/filtered` | `nav_msgs/Odometry` | Local fused odometry (Wheel Odom + 9-DOF IMU) from Stage 1 EKF |
| `/odometry/global` | `nav_msgs/Odometry` | Global earth-frame odometry (Local Filter + GPS) from Stage 2 EKF |
| `/scan` | `sensor_msgs/LaserScan` | 2D LiDAR range scan data (12 Hz, YDLIDAR G4) |
| `/hiwonder/gps/fix` | `sensor_msgs/NavSatFix` | Raw GNSS GPS coordinates (latitude, longitude, altitude) |
| `/hiwonder/imu/data_raw` | `sensor_msgs/Imu` | 9-DOF linear acceleration and angular velocity |
| `/hiwonder/imu/mag` | `sensor_msgs/MagneticField` | Calibrated magnetometer vector |
| `/battery_state` | `sensor_msgs/BatteryState` | Sabertooth 2x32 live battery voltage, current, and temperature |
| `/sabertooth/battery_voltage` | `std_msgs/Float32` | Instantaneous battery voltage float |
| `/radio/channels` | `sensor_msgs/Joy` | Normalized HOT RC DS-600 joystick axis positions |
| `/radio/status` | `std_msgs/String` | Radio receiver link state (`CONNECTED` / `DISCONNECTED`) |
| `/outdoor_nav/state` | `std_msgs/String` | Current outdoor navigation state machine mode |
| `/outdoor_nav/current_goal` | `geometry_msgs/PoseStamped` | Active GPS waypoint goal in local ENU frame |
| `/map` | `nav_msgs/OccupancyGrid` | 2D SLAM occupancy grid map from `slam_toolbox` |
| `/tf`, `/tf_static` | `tf2_msgs/TFMessage` | Coordinate frame tree (`map -> odom -> base_link -> laser_frame`) |

---

## ⚡ Quick Start Guide

### 1. Prerequisites
* **Ubuntu 24.04 LTS arm64** (or x86_64) with **ROS 2 Jazzy Jalisco**.
* **Node.js** (v18+) & **npm** (v9+).
* **System packages**:
  ```bash
  sudo apt update
  sudo apt install -y ros-jazzy-rosbridge-server ros-jazzy-slam-toolbox \
      ros-jazzy-robot-localization ros-jazzy-robot-state-publisher \
      ros-jazzy-web-video-server python3-pyserial python3-flask python3-flask-cors python3-psutil
  ```

### 2. Install Udev Rules
```bash
sudo cp udev_rules/99-amr.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### 3. Build the ROS 2 Workspace
```bash
cd ~/Desktop/Xtrmbly
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install --packages-skip mapviz mapviz_interfaces mapviz_plugins multires_image tile_map
source install/setup.bash
```

---

## 🚀 Launching the Robot

### 🌟 All-in-One Dashboard Launch (Recommended)
To launch the background services, ROSBridge WebSocket, Flask API, and Vite Web Dashboard with a single command:

```bash
cd ~/Desktop/Xtrmbly
./start_all.sh
```

Open `http://<ROBOT_IP>:3000` (or `http://localhost:3000`) in any browser on the local network.
* Go to the **Robot Control** panel to bring up the full navigation stack with 1-click.
* Click **`[ ⚡ Turn ON Radio Teleop Drive ]`** to activate the HOT RC DS-600 radio and Sabertooth motor drive.

---

### 🛠️ Modular Launch Commands

#### 1. Core Navigation Bringup (Local EKF + Sensors + SLAM)
```bash
ros2 launch rock_bringup navigation.launch.py start_manual_drive:=true start_camera:=false
```

#### 2. Manual Radio Teleop & Sabertooth Motor Drive
```bash
ros2 launch sabertooth_driver manual_radio_drive.launch.py
```

#### 3. Outdoor Autonomous GPS Navigation
```bash
ros2 launch outdoor_navigation outdoor_navigation.launch.py
```

#### 4. SLAM Mapping Mode
```bash
ros2 launch rock_bringup mapping.launch.py start_manual_drive:=true
```

#### 5. Synchronized MCAP Telemetry Recording
```bash
ros2 run amr_data_recorder record
```

#### 6. Authoritative Power-Cycle Session Publisher (/amr/session)
```bash
ros2 run amr_session session_publisher
```

---

## 🆔 Authoritative Power-Cycle Session Contract

The robot manages an authoritative power-cycle session conforming to the browser client contract:

* **ROS 2 Topic**: `/amr/session`
* **Message Type**: `std_msgs/msg/String` (JSON string)
* **QoS**: `Reliability: RELIABLE`, `Durability: TRANSIENT_LOCAL` (depth: 1)
* **Publication Rate**: Immediate on startup, and every **2.0 seconds** while active.
* **Payload Structure**:
  ```json
  {
    "schema_version": 1,
    "robot_id": "amr-1",
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "started_at": "2026-09-25T10:00:00.000Z",
    "state": "active"
  }
  ```
* **Durable Idempotency Key**: Linux kernel boot ID (`/proc/sys/kernel/random/boot_id`). Reboots trigger a brand-new session; reloads, reconnects, or process restarts within the same boot reuse the existing authoritative session.
* **Orderly Shutdown**: Upon SIGTERM/SIGINT, announces `"state": "ended"` before shutting down transport.
* **Systemd Service**: `scripts/amr-session.service` is available to start the session publisher on boot (`sudo cp scripts/amr-session.service /etc/systemd/system/ && sudo systemctl enable --now amr-session.service`).

---

## 🧪 Testing & Verification

The codebase includes comprehensive unit test suites covering the frontend, backend server, and autonomous navigation algorithms:

```bash
# 1. Run Outdoor Navigation Geodesy & State Machine Tests
pytest src/outdoor_navigation/test/

# 2. Run AMR Session Manager Unit Tests (9 Unit Tests)
PYTHONPATH=src/amr_session pytest src/amr_session/test/

# 3. Run Dashboard Flask Backend Tests (37 Unit Tests)
pytest admin-dashboard/server/tests/test_server.py

# 4. Run Dashboard Frontend Vitest Suite (130 Unit Tests across 10 test suites)
cd admin-dashboard && npm test -- --run
```

| Test Suite | Framework | Total Tests | Pass Rate |
|---|---|---|---|
| **Outdoor Navigation Algorithms** | Pytest | 7 | **100% (7/7 Passed)** |
| **AMR Power-Cycle Session Manager** | Pytest | 9 | **100% (9/9 Passed)** |
| **Admin Backend Server API** | Pytest | 37 | **100% (37/37 Passed)** |
| **React Frontend Diagnostics UI** | Vitest | 130 | **100% (130/130 Passed)** |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
