# Hybrid AMR (Autonomous Mobile Robot)

A full-stack **ROS 2 Jazzy** autonomous mobile robot platform designed for hybrid indoor and outdoor navigation. Featuring automated GPS-to-SLAM transition management, hardware driver nodes, sensor telemetry recording, and a real-time onboard ROS 2 diagnostics dashboard.

![ROS 2 Jazzy](https://img.shields.io/badge/ROS_2-Jazzy-blue)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🌟 Key Features

* **Hybrid Navigation State Machine**: Automatic switching between outdoor GPS navigation (u-blox GNSS) and indoor 2D SLAM navigation (`slam_toolbox`) based on real-time signal validity.
* **ESP32 Wheel Odometry & Control**: Serial communication node (`/dev/esp` @ 115200 baud) for sending `/cmd_vel` motor commands and receiving encoder ticks to compute `/odom` and TF transforms (`odom` $\rightarrow$ `base_link`).
* **IMU & LiDAR Hardware Drivers**: Sensor drivers for GY-80 IMU (`/dev/esp-imu`) publishing raw acceleration and magnetic fields, and YDLidar range sensors publishing to `/scan`.
* **Telemetry Data Recorder**: Dedicated recording tool (`amr_data_recorder`) for capturing synchronized sensor streams (`/scan`, `/imu/*`, `/odom`, `/fix`, `/tf`) into MCAP format ROS 2 bags with structured experiment metadata (`metadata.yaml`).
* **Web Onboard Admin & Diagnostics Dashboard** (`admin-dashboard`): the actively maintained onboard tool, built to run directly on the Rubik Pi itself.
  * **ROS Graph Health**: live node/topic/service registry, per-topic Hz, TF tree staleness (`map→odom`, `odom→base_link`).
  * **Processes & Hardware**: serial device presence/permissions for `/dev/esp` and the lidar, GPS fix decode, managed-process status/restart for the `hybrid_manager` subprocess stack.
  * **Pi System Health**: CPU temperature, per-core usage, RAM, disk, network interfaces.
  * **Logs Viewer**: live `~/.ros/log/` and `journalctl` tailing.
  * See [`admin-dashboard/README.md`](admin-dashboard/README.md) for full details, ports, and its security/trust model (no auth — LAN-only tool).

> **Note:** the earlier operator-facing `amr-dashboard` (React + Leaflet mission-planning GCS) and the `Frontend V1` prototypes have been retired and removed from this workspace as of 2026-08-18. `admin-dashboard` is the only dashboard currently deployed and maintained.

---

## 📁 Repository Structure

```
├── admin-dashboard/          # Onboard ROS 2 admin & diagnostics dashboard (React + Vite + Flask)
│   ├── src/                  # Dashboard UI (ROS Graph, Processes & Hardware, Pi System, Logs, Camera panels)
│   ├── server/server.py      # Local Flask API (0.0.0.0:5001) — hardware/process/system status
│   ├── package.json
│   └── vite.config.js
├── src/                      # ROS 2 Jazzy Workspace Packages
│   ├── hybrid_navigation/    # Hybrid state machine manager (GPS search <-> SLAM mode transition)
│   ├── esp32_odom/           # ESP32 serial odometry broadcaster & command velocity bridge
│   ├── imu_node/             # GY-80 IMU serial data parser (/imu/data_raw, /imu/mag)
│   ├── amr_data_recorder/    # MCAP ROS bag data recorder node with metadata generation
│   ├── gogo_description/     # Robot URDF geometry (Xacro), meshes, and state publisher launch
│   ├── rock_bringup/         # Top-level launch scripts (navigation.launch.py)
│   ├── indoor_amr/           # Indoor SLAM navigation launch configurations
│   ├── ydlidar_ros2_driver/  # YDLidar 2D laser scanner driver
│   ├── YDLidar-SDK/          # YDLidar C++ SDK library
│   └── mapviz/               # MapViz visualization configurations (not referenced by any launch file)
```

Three directories under `src/` (`YDLidar-SDK`, `mapviz`, `ydlidar_ros2_driver`) are vendored checkouts carrying their own nested `.git` — there is no `.gitmodules`, so they are plain populated directories rather than git-managed submodules. That conversion is a known, still-undecided item (see `AGENTS.md`).

---

## ⚡ Prerequisites

1. **ROS 2 Jazzy Jalisco** installed on Ubuntu 24.04 LTS (or compatible Linux OS, incl. arm64 SBCs such as the Rubik Pi).
2. **Node.js** (v18+) & **npm** (v9+).
3. **Python 3.12+** with required dependencies:
   ```bash
   pip install pyserial
   ```
   `admin-dashboard/server/server.py` additionally requires `flask` and `psutil`.
4. **ROS 2 Packages**:
   ```bash
   sudo apt update
   sudo apt install ros-jazzy-rosbridge-server ros-jazzy-slam-toolbox ros-jazzy-navigation2 ros-jazzy-nav2-bringup ros-jazzy-robot-state-publisher
   ```

---

## 🚀 Quick Start Guide

> These steps assume the workspace lives at `~/Desktop/Xtrmbly` on the robot — several launch files (`hybrid_manager.py`, `rock_bringup/navigation.launch.py`) currently hardcode this absolute path when sourcing `install/setup.bash`. If you clone this elsewhere, update those paths first (tracked as a known portability gap).

### 1. Build the ROS 2 Workspace

```bash
cd ~/Desktop/Xtrmbly
colcon build --symlink-install --packages-skip mapviz mapviz_interfaces mapviz_plugins multires_image tile_map
source install/setup.bash
```
(`mapviz` is skipped by default — it's a heavy Qt build and isn't referenced by any launch file here. Drop the `--packages-skip` flag if you need it.)

### 2. Launch Hardware & Navigation Stack

To launch the full navigation stack:
```bash
ros2 launch rock_bringup navigation.launch.py
```
Note: this requires `/home/ubuntu/ublox_config.yaml` (GPS) and a saved map at the path set in `rock_bringup/config/mapper_localization.yaml` — neither ships with this repo and must be provided per-robot.

To run the automated Hybrid Mode Manager (monitors GPS fix and transitions to SLAM if fix lost):
```bash
ros2 run hybrid_navigation hybrid_manager
```

To start the ROSBridge WebSocket server for the dashboard:
```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

For a minimal hardware smoke-test without GPS/SLAM (robot description + odometry + IMU + bridge only):
```bash
ros2 launch gogo_description robot_state_publisher.launch.py &
ros2 run esp32_odom odom_node &
ros2 run imu_node imu_serial_node &
ros2 launch rosbridge_server rosbridge_websocket_launch.xml &
```

### 3. Launch the Onboard Admin & Diagnostics Dashboard (`admin-dashboard`)

```bash
cd ~/Desktop/Xtrmbly/admin-dashboard
npm install       # run natively on the target machine's own architecture — see note below
python3 server/server.py &     # Flask API on 0.0.0.0:5001
npm run dev &                  # Vite dev server on 0.0.0.0:3000
```

Open `http://<ROBOT_IP>:3000` from any browser on the robot's LAN. `admin-dashboard/.env` must point `VITE_ROSBRIDGE_URL` / `VITE_BACKEND_URL` / `VITE_VIDEO_SERVER_URL` at the robot's actual LAN IP (not `localhost`) for remote browsers to connect — see [`admin-dashboard/README.md`](admin-dashboard/README.md).

> **arm64 note:** `node_modules` must be installed on the target machine directly. A copy of `node_modules` produced on a different OS/architecture (e.g. synced over from a Windows/x86 dev machine) will be missing arm64-native binaries (observed: Rollup's `@rollup/rollup-linux-arm64-gnu`) and will have lost the executable bit on `node_modules/.bin/*` scripts. If `npm run dev` fails with `vite: Permission denied` or a Rollup "Cannot find module" error, delete `node_modules`/`package-lock.json` and re-run `npm install` on the Pi itself.

---

## 📡 Topic & Service Contract

| Topic | Message Type | Description / Usage |
|---|---|---|
| `/fix` | `sensor_msgs/NavSatFix` | GPS Fix coordinates |
| `/odom` | `nav_msgs/Odometry` | Wheel odometry velocity & pose from ESP32 |
| `/scan` | `sensor_msgs/LaserScan` | 2D LiDAR range scan data |
| `/map` | `nav_msgs/OccupancyGrid` | SLAM occupancy map from `slam_toolbox` |
| `/tf`, `/tf_static` | `tf2_msgs/TFMessage` | Coordinate frame transforms (`odom` $\rightarrow$ `base_link` $\rightarrow$ `laser_frame`) |
| `/robot_description` | `std_msgs/String` | Robot URDF model XML |
| `/imu/data_raw` | `sensor_msgs/Imu` | Raw linear acceleration from GY-80 IMU |
| `/imu/mag` | `sensor_msgs/MagneticField` | Magnetometer from GY-80 IMU |
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

## ⚠️ Known Hardware / Config Gaps (as of 2026-08-18)

* **`/dev/lidar` udev symlink is position-based, not identity-based.** `99-robot.rules` assigns it by physical USB port (`KERNELS=="1-1"`), unlike `99-esp.rules`, which correctly matches the ESP32 by its unique `ATTRS{serial}`. Whatever device is plugged into that physical port claims `/dev/lidar` — on the current robot the ESP32 occupies that port, so `/dev/lidar` currently resolves to the ESP32, not the lidar. Do not launch `ydlidar_ros2_driver` against `/dev/lidar` until this is fixed (rewrite the rule to match by serial number, the same way `99-esp.rules` does).
* **`/home/ubuntu/ublox_config.yaml` does not exist** on the reference robot, so `ublox_gps_node` (GPS) cannot launch as configured in `hybrid_manager.py`.
* **No saved map exists** at the path `rock_bringup/config/mapper_localization.yaml` expects (`/home/ubuntu/2_maps/maptest3`), so `rock_bringup navigation.launch.py`'s localization step will fail until one is generated (`indoor_amr` mapping mode) and copied into place.
* **No camera driver node ships in this workspace.** `web_video_server` has nothing to bridge unless a separate camera driver (e.g. `realsense2_camera`) is launched independently.

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
