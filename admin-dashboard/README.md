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
| (navigation.launch|       |   therm / psutil)  |      |   /imu, /tf, /cmd_vel)|
+-------------------+       +--------------------+      +-----------------------+
                                                                    ^
                                                                    |
+-------------------------------------------------------------+     |
|             Universal Camera Streamer & QoS Bridge          |     |
|      (camera_streamer.py -> web_video_server :8080)         |-----+
|  * RealSense RGB (/dev/video4) @ 424x240 15 FPS [RELIABLE]  |
|  * RealSense Depth (/dev/video0) -> TURBO Colormap          |
|  * Pro-Max Dynamic Telemetry HUD Fallback Stream            |
+-------------------------------------------------------------+
```

---

## 🛠️ Network Ports & Component Matrix

| Service | Protocol / Port | Process Entrypoint | Description |
|---|---|---|---|
| **Diagnostic UI** | HTTP `3000` | `npm run dev -- --host 0.0.0.0 --port 3000` | React 18 + Vite real-time monitoring interface |
| **Admin Backend API** | HTTP REST `5001` | `admin-dashboard/server/server.py` | Stack lifecycle, hardware status, PID metrics, logs |
| **ROSBridge WebSocket** | WS `9090` | `ros2 launch rosbridge_server rosbridge_websocket_launch.xml` | JSON WebSocket bridge for ROS topics & services |
| **MJPEG Video Server** | HTTP `8080` | `ros2 run web_video_server web_video_server` | Real-time MJPEG live camera and depth stream |
| **Universal Camera Streamer** | ROS 2 Node | `admin-dashboard/server/camera_streamer.py` | Direct V4L2 capture, QoS bridge, and HUD generator |

---

## 🔍 Major Issues Encountered & Exact Rectifications

During the development, hardware integration, and deployment of the onboard server dashboard on the Rubik Pi / ROS 2 Jazzy platform, several critical low-level kernel, driver, DDS, and networking issues were identified and resolved:

### 1. Serial Port Collision Between ESP32 & LiDAR (udev Overlap & Blind Fallback Loops)
* **Issue**:
  - Both the ESP32 Motor Controller and the YDLIDAR G2B utilize Silicon Labs CP210x USB-to-UART bridges with identical vendor IDs (`10c4:ea60`).
  - When `/dev/amr_lidar` experienced transient delays during launch, `ydlidar_launch.py` iterated through a blind fallback list (`['/dev/ttyUSB3', '/dev/ttyUSB4', '/dev/lidar', '/dev/ttyUSB0']`).
  - `/dev/ttyUSB3` was actively claimed by the ESP32 motor controller. The LiDAR driver seized `/dev/ttyUSB3` at 230400 baud, corrupting wheel odometry serial frames and failing LiDAR initialization.
* **Rectification**:
  - **Hardware Attribute Matching**: Rewrote `resolve_lidar_port()` inside [`ydlidar_launch.py`](file:///home/ubuntu/Desktop/Xtrmbly/src/ydlidar_ros2_driver/launch/ydlidar_launch.py) to inspect sysfs device attributes (`idVendor == 10c4`) while explicitly filtering out the ESP32 hardware serial (`a8f8c998665df01189fd5e401045c30f`).
  - **Strict Udev Binding**: Updated `/etc/udev/rules.d/99-amr.rules` to uniquely bind the ESP32 by its hardware serial and map `/dev/amr_encoder` and `/dev/amr_lidar` to isolated, non-overlapping nodes.

---

### 2. USB 2.0 Hub Brownout (`error -71` / `EPROTO`)
* **Issue**:
  - Inrush current from the Intel RealSense D435i camera and YDLIDAR motor spin-up intermittently triggered voltage drops on the on-board Genesys Logic 4-port USB 2.0 hub (`05e3:0610`).
  - The Linux kernel responded with `usb 1-2: device not accepting address, error -71`, disabling the entire USB bus until the machine was physically power-cycled.
* **Rectification**:
  - **PCIe Host Controller Auto-Healing**: Created [`scripts/usb_heal.sh`](file:///home/ubuntu/Desktop/Xtrmbly/scripts/usb_heal.sh) to programmatically unbind and rebind the PCIe xHCI host controller (`0000:01:00.0` at `/sys/bus/pci/drivers/xhci_hcd`), force a udev settlement, and restore all USB sensor endpoints without rebooting.
  - Sourced `usb_heal.sh` at the beginning of [`start_all.sh`](file:///home/ubuntu/Desktop/Xtrmbly/start_all.sh).

---

### 3. Missing Live Video Feed & RealSense DDS QoS Incompatibility
* **Issue**:
  - The Intel RealSense ROS 2 node published color frames to `/camera/camera/color/image_raw` with `SensorDataQoS` (`BEST_EFFORT` reliability).
  - `web_video_server` (port 8080) subscribed with default `RELIABLE` QoS. In FastDDS / ROS 2, a `RELIABLE` subscriber cannot receive messages from a `BEST_EFFORT` publisher, resulting in zero frames reaching the MJPEG video stream and a broken video widget in the browser.
* **Rectification**:
  - **Unified Camera Streamer & QoS Bridge ([`camera_streamer.py`](file:///home/ubuntu/Desktop/Xtrmbly/admin-dashboard/server/camera_streamer.py))**:
    - Implemented a dedicated high-performance streaming node that bridges camera feeds into `RELIABLE` QoS topics (`/camera/color/image_raw` and `/camera/camera/color/image_raw`).
    - Added real-time **16-bit Depth Colormapping** (converts `16UC1` depth from `/camera/camera/depth/image_rect_raw` to high-contrast `TURBO` colormap on `/camera/camera/depth/image_rect_raw/color`).
    - Added **Pro-Max Diagnostic HUD**: If the optical camera is unplugged, the streamer automatically generates a live telemetry HUD overlay with odometry speed/coordinates, IMU yaw, and GPS coordinates.

---

### 4. RealSense V4L2 Device Channel Mapping
* **Issue**:
  - On the Intel RealSense D435i, `/dev/video0` and `/dev/video1` are dedicated to 16-bit infrared and depth sensors (`Z16` / `GREY`).
  - Standard V4L2 camera nodes targeting `/dev/video0` failed with format negotiation errors.
* **Rectification**:
  - Discovered that `/dev/video4` is the native hardware RGB Optical Sensor (`YUYV 4:2:2`).
  - Configured `camera_streamer.py` and `v4l2_camera` to dynamically auto-detect and capture from `/dev/video4` at native `424x240 @ 15 FPS`.

---

### 5. Subshell Process Group Reaping on Daemon Launch
* **Issue**:
  - Starting services via `nohup python3 ... &` in non-interactive subshells caused background processes to be reaped by the Linux kernel when the spawning subshell terminated.
* **Rectification**:
  - Hardened [`start_all.sh`](file:///home/ubuntu/Desktop/Xtrmbly/start_all.sh) using `setsid`, ensuring each service runs in an isolated process group that persists independently.

---

### 6. FastDDS Shared Memory (`/dev/shm`) Mutex Lockup
* **Issue**:
  - FastDDS default shared memory transport (`shm`) occasionally locked inter-process mutexes when rapid node restarts occurred.
* **Rectification**:
  - Standardized FastDDS UDP-only profile across the workspace via [`fastdds_udp.xml`](file:///home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml):
    ```bash
    export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml
    export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
    ```

---

## 📡 REST API Endpoint Documentation (`server.py`)

The Flask backend exposes the following REST API endpoints on `http://<ROBOT_IP>:5001`:

| Endpoint | Method | Payload / Params | Description |
|---|---|---|---|
| `/api/status` | `GET` | — | Returns full system status: CPU temp, RAM, Disk, active interfaces, serial device states, and managed PIDs |
| `/api/stack/start` | `POST` | `{"start_camera": true, "camera_mode": "auto"}` | Launches the complete navigation stack (`navigation.launch.py`) |
| `/api/stack/stop` | `POST` | — | Gracefully terminates the robot stack |
| `/api/stack/logs` | `GET` | `?lines=100` | Streams the real-time bringup console log buffer |
| `/api/camera/toggle` | `POST` | `{"enable": true, "mode": "realsense"}` | Toggles the camera module independently |
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

### 2. Access the Dashboard
- **Web UI**: Open `http://<ROBOT_IP>:3000` (or `http://localhost:3000`)
- **Backend API**: `http://<ROBOT_IP>:5001`
- **Video Stream**: `http://<ROBOT_IP>:8080/stream_viewer?topic=/camera/camera/color/image_raw`

### 3. Run Automated Test Suites
```bash
cd ~/Desktop/Xtrmbly/admin-dashboard

# Run Backend Python Tests (32 Unit Tests)
pytest server/tests/test_server.py

# Run Frontend Vitest Suite (117 Tests across 9 test files)
npm test
```

---

## 🧪 Test Suite Results Summary
- **Backend Tests (Pytest)**: `32/32 passed` (100% pass rate)
- **Frontend Tests (Vitest)**: `117/117 passed` across 9 component test suites (100% pass rate)
