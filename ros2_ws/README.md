# Hybrid AMR (Autonomous Mobile Robot)

A full-stack **ROS 2 Jazzy** autonomous mobile robot platform designed for hybrid indoor and outdoor navigation. Featuring automated GPS-to-SLAM transition management, hardware driver nodes, sensor telemetry recording, and a real-time React Ground Control Station (GCS) dashboard.

![ROS 2 Jazzy](https://img.shields.io/badge/ROS_2-Jazzy-blue)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🌟 Key Features

* **Hybrid Navigation State Machine**: Automatic switching between outdoor GPS navigation (u-blox GNSS) and indoor 2D SLAM navigation (`slam_toolbox`) based on real-time signal validity.
* **ESP32 Wheel Odometry & Control**: Serial communication node (`/dev/esp` @ 115200 baud) for sending `/cmd_vel` motor commands and receiving encoder ticks to compute `/odom` and TF transforms (`odom` $\rightarrow$ `base_link`).
* **IMU & LiDAR Hardware Drivers**: Sensor drivers for GY-80 IMU (`/dev/esp-imu`) publishing raw acceleration and magnetic fields, and YDLidar range sensors publishing to `/scan`.
* **Telemetry Data Recorder**: Dedicated recording tool (`amr_data_recorder`) for capturing synchronized sensor streams (`/scan`, `/imu/*`, `/odom`, `/fix`, `/tf`) into MCAP format ROS 2 bags with structured experiment metadata (`metadata.yaml`).
* **Web Ground Control Station (`amr-dashboard`)**:
  * **ROSBridge WebSocket Interface**: Zero mock data; live rendering over `ws://localhost:9090`.
  * **GPS Satellite View**: Interactive Leaflet / OpenStreetMap map with real-time robot path tracking and waypoint destination line rendering.
  * **Indoor SLAM View**: Canvas2D renderer for `nav_msgs/OccupancyGrid` map visualization.
  * **2D LiDAR Scan**: Real-time laser scanner rendering with dynamic safety zone indicators.
  * **3D URDF Robot Visualizer**: Three.js / ROS3DJS rendering of robot kinematics from `/robot_description` and TF frames.
  * **Mission Planner & Emergency Controls**: Interface for sending GPS target coordinates, controlling mission states (`START`/`PAUSE`/`STOP`), and executing emergency stop commands.

---

## 📁 Repository Structure

```
├── amr-dashboard/           # Ground Control Station web app (React + Vite + TailwindCSS)
│   ├── src/
│   │   ├── components/      # UI Views (GpsMapView, SlamView, LidarView, CameraView, UrdfWidget, etc.)
│   │   ├── context/         # MissionContext for coordinate state management
│   │   ├── hooks/           # Custom ROSBridge subscription hooks (useGps, useOdometry, useLaserScan, etc.)
│   │   └── services/        # RosConnectionService & RobotCommandService
│   ├── package.json
│   └── vite.config.js
├── src/                     # ROS 2 Jazzy Workspace Packages
│   ├── hybrid_navigation/   # Hybrid state machine manager (GPS search <-> SLAM mode transition)
│   ├── esp32_odom/          # ESP32 serial odometry broadcaster & command velocity bridge
│   ├── imu_node/            # GY-80 IMU serial data parser (/imu/data_raw, /imu/mag)
│   ├── amr_data_recorder/   # MCAP ROS bag data recorder node with metadata generation
│   ├── gogo_description/    # Robot URDF geometry (Xacro), meshes, and state publisher launch
│   ├── rock_bringup/        # Top-level launch scripts (navigation.launch.py)
│   ├── indoor_amr/          # Indoor SLAM navigation launch configurations
│   ├── ydlidar_ros2_driver/ # YDLidar 2D laser scanner driver
│   ├── YDLidar-SDK/         # YDLidar C++ SDK library
│   └── mapviz/              # MapViz visualization configurations
└── unclean/                 # Archived legacy code, unused components, and graph dumps
```

---

## ⚡ Prerequisites

1. **ROS 2 Jazzy Jalisco** installed on Ubuntu 24.04 LTS (or compatible Linux OS).
2. **Node.js** (v18+) & **npm** (v9+).
3. **Python 3.12+** with required dependencies:
   ```bash
   pip install pyserial
   ```
4. **ROS 2 Packages**:
   ```bash
   sudo apt update
   sudo apt install ros-jazzy-rosbridge-server ros-jazzy-slam-toolbox ros-jazzy-navigation2 ros-jazzy-nav2-bringup ros-jazzy-robot-state-publisher
   ```

---

## 🚀 Quick Start Guide

### 1. Build the ROS 2 Workspace

```bash
cd ~/ros2_ws
colcon build --symlink-install
source install/setup.bash
```

### 2. Launch Hardware & Navigation Stack

To launch the full navigation stack:
```bash
ros2 launch rock_bringup navigation.launch.py
```

To run the automated Hybrid Mode Manager (monitors GPS fix and transitions to SLAM if fix lost):
```bash
ros2 run hybrid_navigation hybrid_manager
```

To start the ROSBridge WebSocket server for the web dashboard:
```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

### 3. Launch the Ground Control Station (`amr-dashboard`)

In a new terminal:
```bash
cd ~/ros2_ws/amr-dashboard
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) in your browser to view live telemetry and control the robot.

---

## 📡 Topic & Service Contract

| Topic | Message Type | Description / Usage |
|---|---|---|
| `/fix` | `sensor_msgs/NavSatFix` | GPS Fix coordinates (used by GPS Map & Status Panel) |
| `/odom` | `nav_msgs/Odometry` | Wheel odometry velocity & pose from ESP32 |
| `/scan` | `sensor_msgs/LaserScan` | 2D LiDAR range scan data |
| `/map` | `nav_msgs/OccupancyGrid` | SLAM occupancy map from `slam_toolbox` |
| `/tf`, `/tf_static` | `tf2_msgs/TFMessage` | Coordinate frame transforms (`odom` $\rightarrow$ `base_link` $\rightarrow$ `laser_frame`) |
| `/robot_description` | `std_msgs/String` | Robot URDF model XML |
| `/imu/data_raw` | `sensor_msgs/Imu` | Raw linear acceleration from GY-80 IMU |
| `/cmd_vel` | `geometry_msgs/Twist` | Motor velocity commands |
| `/emergency_stop` | `std_msgs/Bool` | Emergency stop signal |
| `/mission_state_cmd` | `std_msgs/String` | Mission state commands (`START`, `PAUSE`, `STOP`) |

---

## ⏺️ Recording Experiment Data

To record a synchronized MCAP ROS bag with experiment metadata:

```bash
ros2 run amr_data_recorder record
```

Follow the prompt to enter an experiment name. Recordings and `metadata.yaml` will be saved under `~/amr_data/YYYY-MM-DD_HH-MM-SS_<name>/`.

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
