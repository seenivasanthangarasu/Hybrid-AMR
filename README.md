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
  * **Robot Bringup & Control**: Start/Stop full navigation stack (`navigation.launch.py`) with automatic startup of Odom, GY-80 IMU, YDLidar, URDF, and SLAM Toolbox.
  * **Selective Camera Control**: Independent ON/OFF toggle for the Camera module (`v4l2_camera_node` on `/dev/video0`) with real-time launch progress phases and live bringup console logs.
  * **ROS Graph Health**: live node/topic/service registry, per-topic Hz, TF tree staleness (`map→odom`, `odom→base_link`).
  * **Processes & Hardware**: serial device presence/permissions for `/dev/esp`, `/dev/esp-imu`, `/dev/ttyUSB0`, managed-process status/metrics (PID, CPU%, Memory%, Uptime).
  * **Pi System Health**: CPU temperature, per-core usage, RAM, disk, network interfaces.
  * **Logs Viewer**: live `~/.ros/log/` and `journalctl` tailing.
  * See [`admin-dashboard/README.md`](admin-dashboard/README.md) for full details, ports, and its security/trust model (no auth — LAN-only tool).

> **Note:** the earlier operator-facing `amr-dashboard` (React + Leaflet mission-planning GCS) and the `Frontend V1` prototypes have been retired and removed from this workspace as of 2026-08-18. `admin-dashboard` is the only dashboard currently deployed and maintained.

---

## 📁 Repository Structure

```
├── start_all.sh              # Single-command startup script for all background services & dashboard
├── admin-dashboard/          # Onboard ROS 2 admin & diagnostics dashboard (React + Vite + Flask)
│   ├── src/                  # Dashboard UI (Robot Control, ROS Graph, Processes & Hardware, Pi System, Logs, Camera)
│   ├── server/server.py      # Local Flask API (0.0.0.0:5001) — stack control, hardware/process metrics
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
   pip install pyserial flask flask-cors psutil requests
   ```
4. **ROS 2 Packages**:
   ```bash
   sudo apt update
   sudo apt install ros-jazzy-rosbridge-server ros-jazzy-slam-toolbox ros-jazzy-navigation2 ros-jazzy-nav2-bringup ros-jazzy-robot-state-publisher ros-jazzy-v4l2-camera
   ```

---

## 🚀 All-in-One Startup Command (Recommended)

To launch the complete project (ROSBridge server, Flask Admin Backend API, and Vite Dashboard Frontend) with a single command:

```bash
cd ~/Desktop/Xtrmbly
./start_all.sh
```

Once started:
* **Dashboard Frontend**: Open `http://<ROBOT_IP>:3000` (or `http://localhost:3000`) in your browser.
* **Robot Bringup**: Go to the **Robot Control** tab and click **"Launch Robot Stack"** to automatically launch Odom, IMU, YDLidar, URDF, and SLAM Localization.

---

## 🛠️ Step-by-Step Manual Startup

### 1. Build the ROS 2 Workspace

```bash
cd ~/Desktop/Xtrmbly
colcon build --symlink-install --packages-skip mapviz mapviz_interfaces mapviz_plugins multires_image tile_map
source install/setup.bash
```

### 2. Start Dashboard Services Individually

```bash
# Terminal 1: ROSBridge WebSocket (Port 9090)
source /opt/ros/jazzy/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090

# Terminal 2: Admin Backend Server (Port 5001)
cd ~/Desktop/Xtrmbly/admin-dashboard
python3 server/server.py

# Terminal 3: Dashboard Frontend (Port 3000)
cd ~/Desktop/Xtrmbly/admin-dashboard
npm run dev -- --host 0.0.0.0 --port 3000
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
