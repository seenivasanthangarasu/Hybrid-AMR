# Rubik Pi ROS 2 Admin & Diagnostics Dashboard

A lightweight, standalone onboard administration and troubleshooting dashboard built for ROS 2 Jazzy (Ubuntu 24.04) running directly on the **Rubik Pi** single-board computer.

> [!NOTE]
> **Purpose**: This tool is strictly for physical or local network troubleshooting by technicians/developers standing at the robot or on its local WiFi/LAN. It is **not** an operator control UI or mission planner.

---

## 🚀 Quick Start

### 1. Install Node Dependencies
```bash
cd admin-dashboard
npm install
```

### 2. Start the Local Python Backend
The local backend is a zero-dependency Flask API (`server/server.py`) that reads hardware state (`/dev/esp`, `/dev/ttyUSB0`), monitors managed processes (`hybrid_manager`, `ydlidar_ros2_driver`, `ublox_gps_node`, etc.), reads CPU temperatures and network interface IPs, and exposes a process restart API.

```bash
# Runs on 0.0.0.0:5001
python3 server/server.py
```

### 3. Launch the Diagnostic Frontend
```bash
# Runs on 0.0.0.0:3000
npm run dev
```

Open `http://<RUBIK_PI_IP>:3000` in any web browser on the robot's LAN.

---

## 🔒 Security & Trust Model

* **Authentication**: None.
* **Network Binding**: Both the Vite dev server (`port 3000`) and the Python backend (`port 5001`) bind to `0.0.0.0` so any device on the robot's local WiFi/Ethernet subnet can access it.
* **Threat Model**: Designed exclusively for isolated, physically-secured robot subnets. Never expose ports 3000, 5001, or 9090 to the public internet.

---

## 🛠️ System Architecture & Ports

| Component | Technology | Default Port | Description |
|---|---|---|---|
| **Diagnostic UI** | React 18 + Vite | `3000` | Real-time diagnostic interface |
| **Local API** | Python 3 Flask | `5001` | System metrics, serial devices, process monitoring & restarts |
| **ROSBridge** | ROS 2 WebSocket | `9090` | JSON WebSocket interface to ROS graph |
| **Video Server** | web_video_server | `8080` | MJPEG camera stream provider |

---

## 📊 Dashboard Panels

### 1. ROS Graph Health
* **Node & Topic Registry**: List active ROS 2 nodes, advertised topics, and services.
* **Live Update Rates**: Calculates real-time message frequencies (Hz) per topic.
* **TF Tree Status**: Monitors `map -> odom` (SLAM global localization status) and `odom -> base_link` (Odometry status) with age & staleness badges.
* **`/robot_mode` Handling**: Gracefully reports "Not published" when `/robot_mode` is absent without synthesizing fake data.
* **Raw Topic Echo Tool**: Interactive console to subscribe to any topic, pause/resume feed, and view raw JSON payloads.

### 2. Managed Processes & Hardware Status
* **Serial Devices**: Checks `/dev/esp` (ESP32 motor bridge) and `/dev/ttyUSB0` (YDLidar) existence and read/write permissions.
* **GPS Telemetry**: Decodes `/fix` (`sensor_msgs/NavSatFix`) for fix type, latitude, longitude, altitude, and staleness.
* **Managed Processes**: Introspects `hybrid_manager` managed subprocesses (`gps_proc`, `urdf_proc`, `lidar_proc`, `odom_proc`, `slam_proc`, `rviz_proc`).
* **Process Restarts**: Button to trigger process termination/relaunch, protected by UI confirmation dialogs.

### 3. Pi System Health
* **Thermals**: CPU temperature monitoring with normal/warm/hot visual alerts.
* **Resources**: Real-time per-core CPU usage, RAM memory usage, and root disk storage.
* **Network Interfaces**: Displays active interfaces (`wlan0`, `eth0`), IP addresses, MAC addresses, and data transfer stats.

### 4. Logs Viewer
* Live tailing of ROS log directory (`~/.ros/log/`) and systemd `journalctl` output.
* Keyword filtering and log severity color highlights (INFO, WARN, ERROR).
