# 🤖 Rubik Pi ROS 2 Server-Side Admin & Diagnostics Dashboard

A high-performance, standalone onboard administration, hardware telemetry, and diagnostic suite built for **ROS 2 Jazzy** (Ubuntu 24.04 LTS arm64) running directly on the **Rubik Pi** single-board computer for the **Hybrid-AMR** platform.

---

## 📌 Architectural Overview

The server-side dashboard operates as an onboard edge-diagnostic layer bridging physical robot hardware, ROS 2 nodes, video streamers, and browser-based remote control clients across the robot's local WiFi/LAN network.

```
                                    +-----------------------------------------+
                                    |         Remote Browser (LAN)            |
                                    |     http://<ROBOT_IP>:3000 (React UI)   |
                                    +----+-----------------+------------------+
                                         |                 |
                   REST API (HTTP) :5001 |                 | WebSocket (JSON) :9090
                                         v                 v
+---------------------------------------------+   +------------------------------------+
|          Flask Backend Server               |   |          ROSBridge Server          |
|         (admin-dashboard/server)            |   |     (rosbridge_websocket :9090)    |
+----------------------+----------------------+   +-----------------+------------------+
                       |                                            |
         +-------------+-------------+                              |
         |                           |                              |
         v                           v                              v
+-------------------+       +--------------------+      +-----------------------+
|  Process Manager  |       |  Hardware Checker  |      |   ROS 2 Graph / Topics|
|  & Launch Control |       |  (udev / sysfs /   |      |  (/odom, /scan, /fix, |
| (navigation.launch|       |   therm / psutil)  |      |   /imu, /tf, /cmd_vel,|
|  & radio_teleop)  |       |  (/dev/sabertooth) |      |   /battery_state)     |
+-------------------+       +--------------------+      +-----------------------+
                                                                    ^
                                                                    |
+-------------------------------------------------------------+     |
|             Vision System & Nginx CORS Reverse Proxy        |     |
|      (camera_streamer.py -> web_video_server :8082)         |-----+
|  * Logitech C270 HD (720p @ 30 FPS MJPG) on /dev/amr_camera |
|  * Non-blocking capture thread publishing at 15-25 Hz       |
|  * Multi-threaded web_video_server (4 server / 2 ROS worker)|
|  * Nginx proxy on :8080 with Access-Control-Allow-Origin: * |
+-------------------------------------------------------------+
```

---

## 🛠️ Network Ports & Component Matrix

| Service | Protocol / Port | Process Entrypoint | Description |
|---|---|---|---|
| **Diagnostic UI** | HTTP `3000` | `npm run dev -- --host 0.0.0.0 --port 3000` | React 18 + Vite real-time monitoring interface |
| **Admin Backend API** | HTTP REST `5001` | `admin-dashboard/server/server.py` | Stack lifecycle, hardware status, PID metrics, battery, shutdown, logs |
| **ROSBridge WebSocket** | WS `9090` | `ros2 launch rosbridge_server rosbridge_websocket_launch.xml` | JSON WebSocket bridge for ROS topics & services |
| **Public Video Server (Nginx)** | HTTP `8080` | `nginx` proxying to `127.0.0.1:8082` | Low-latency MJPEG live stream & snapshots with permissive CORS |
| **Internal Video Server** | HTTP `8082` | `ros2 launch rock_bringup web_video_server.launch.py` | Multi-threaded MJPEG ROS image transport bridge |
| **Universal Camera Streamer** | ROS 2 Node | `admin-dashboard/server/camera_streamer.py` | Non-blocking V4L2 capture, 720p HD streaming, and QoS bridge |

---

## 🔍 Major Features & Low-Level Rectifications

### 1. 1-Click Radio Teleoperation & Sabertooth Drive Control
* **Unified Control UI**: Single prominent toggle button (`[⚡ Turn ON Radio Teleop Drive]` / `[🛑 Turn OFF Radio Teleop Drive]`) in the Robot Control Panel for on-demand teleop activation.
* **Process Conflict Protection**: The backend automatically detects when `sabertooth_node` is active, bypassing direct `/dev/sabertooth` polling to eliminate DTR reset kicks on the motor controller H-bridge.

### 2. Live Motor Driver Battery Telemetry
* **Real-Time Battery Telemetry Card**: Dedicated overview card and header voltage indicator displaying Sabertooth 2x32 live battery state (`/battery_state` and `/sabertooth/battery_voltage`).
* **Direct Serial Polling Fallback**: Polled periodically via non-blocking DEScribe Plain Text protocol (`M1: getb\r\n`) when ROS 2 nodes are offline.

### 3. Graceful Full-Service Shutdown
* **One-Click UI Teardown**: "Shutdown Services" button in the global header issues `POST /api/server/shutdown` to terminate the robot stack, ROSBridge, video streamers, session publisher, frontend, and backend cleanly.
* **Terminal Companion**: Executable `stop_all.sh` provides terminal-level symmetric shutdown matching `start_all.sh`.

### 4. Serial Port Isolation & Hardware Attribute Matching
* **Hardware Attribute Inspection**: Rewrote port resolvers to match unique USB vendor IDs and hardware serial numbers, completely preventing collisions between ESP32 (`/dev/amr_encoder`), YDLIDAR G4 (`/dev/amr_lidar`), Sabertooth 2x32 (`/dev/sabertooth`), Hiwonder GPS (`/dev/hiwonder_gps`), and Hiwonder IMU (`/dev/hiwonder_imu`).

### 5. USB 2.0 Host Controller Auto-Healing (`scripts/usb_heal.sh`)
* Programmatically unbinds and rebinds the PCIe xHCI host controller (`0000:01:00.0`) to instantly recover from USB bus brownouts (`error -71`) without system reboots.

### 6. High-Definition Vision System & Nginx CORS Proxy
* Captures native 1280x720 MJPG frames from Logitech C270 HD Webcam via a dedicated non-blocking thread, streaming at 15–25 Hz without CPU choking.
* Nginx proxy on port 8080 injects `Access-Control-Allow-Origin: *` headers, allowing external browser clients to stream or capture snapshots (`/snapshot?topic=...`) without CORS rejections.

---

## 📡 REST API Endpoint Documentation (`server.py`)

The Flask backend exposes the following REST API endpoints on `http://<ROBOT_IP>:5001`:

| Endpoint | Method | Payload / Params | Description |
|---|---|---|---|
| `/api/status` | `GET` | — | Returns full system status: CPU temp, RAM, Disk, active interfaces, serial device states, and managed PIDs |
| `/api/system` | `GET` | — | Returns system health metrics and cached battery data |
| `/api/battery` | `GET` | — | Returns live Sabertooth motor controller battery voltage and health |
| `/api/stack/start` | `POST` | `{"start_camera": true, "include_manual_drive": true}` | Launches the complete navigation stack (`navigation.launch.py`) |
| `/api/stack/stop` | `POST` | — | Gracefully terminates all robot stack and teleop processes |
| `/api/stack/logs` | `GET` | `?lines=100` | Streams the real-time bringup console log buffer |
| `/api/teleop/toggle` | `POST` | `{"enable": true}` | Starts or stops the combined radio teleop and motor driver stack |
| `/api/motor/toggle` | `POST` | `{"enable": true}` | Toggles Sabertooth motor controller node independently |
| `/api/radio/toggle` | `POST` | `{"enable": true}` | Toggles HOT RC DS-600 radio receiver node independently |
| `/api/camera/toggle` | `POST` | `{"enable": true, "mode": "auto"}` | Toggles the camera streamer module independently |
| `/api/server/shutdown` | `POST` | — | Gracefully halts all stack nodes, ROSBridge, video streamers, and backend |
| `/api/restart` | `POST` | `{"process": "lidar_proc"}` | Restarts a specific managed process |
| `/api/logs` | `GET` | `?source=ros&lines=100&filter=error` | Fetches filtered ROS 2 and `journalctl` log streams |
| `/api/config` | `GET` | — | Returns current backend configuration and workspace path |

---

## 🚀 Quick Start & Usage

### 1. Launch All Services (One Command)
```bash
cd ~/Desktop/Xtrmbly
./start_all.sh
```

### 2. Stop All Services (One Command)
```bash
cd ~/Desktop/Xtrmbly
./stop_all.sh
```

### 3. Access the Dashboard
* **Web UI**: Open `http://<ROBOT_IP>:3000` (or `http://localhost:3000`)
* **Backend API**: `http://<ROBOT_IP>:5001`
* **Video Stream (Iframe Viewer)**: `http://<ROBOT_IP>:8080/stream_viewer?topic=/camera/camera/color/image_raw`
* **Raw Video MJPEG Stream**: `http://<ROBOT_IP>:8080/stream?topic=/camera/camera/color/image_raw&width=640&height=360`
* **Snapshot JPEG**: `http://<ROBOT_IP>:8080/snapshot?topic=/camera/camera/color/image_raw`

### 4. Run Automated Test Suites
```bash
cd ~/Desktop/Xtrmbly/admin-dashboard

# Run Backend Python Tests (38 Unit Tests)
pytest server/tests/test_server.py

# Run Frontend Vitest Suite (133 Tests across 10 test files)
npm test -- --run
```

---

## 🧪 Test Suite Results Summary
* **Backend Tests (Pytest)**: `38/38 passed` (100% pass rate)
* **Frontend Tests (Vitest)**: `133/133 passed` across 10 component test suites (100% pass rate)
