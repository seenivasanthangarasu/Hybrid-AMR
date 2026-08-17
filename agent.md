# AGENTS.md - Antigravity Agent Operations & Restructuring Log

This document records the architectural inspection, dependency positioning, anomaly resolution, and codebase maintenance performed on the **Hybrid-AMR** project.

---

## 📌 System Overview & Location

* **Operating System**: Linux (Ubuntu 24.04 LTS)
* **ROS 2 Distribution**: ROS 2 Jazzy Jalisco
* **Active Workspace Path**: `/home/ubuntu/Desktop/Xtrmbly/ros2_ws`
* **Remote Repository**: `github.com:seenivasanthangarasu/Hybrid-AMR.git` (Branch: `main`)

---

## 🛠️ Dependency File Positioning

The following dependency files were inspected and positioned into their correct architectural locations inside the ROS 2 workspace:

| Dependency File | Original Location | Target Position in Workspace | Status & Execution |
|---|---|---|---|
| **`arrow_teleop.py`** | `Desktop/Xtrmbly/dependecny/arrow_teleop.py` | `src/esp32_odom/esp32_odom/arrow_teleop.py` | **Positioned & Registered**. Added to `esp32_odom/setup.py` entry points. Executable via `ros2 run esp32_odom arrow_teleop`. |
| **`gps_server.py`** | `Desktop/Xtrmbly/dependecny/amr_dashboard/gps_server.py` | `amr-dashboard/legacy_flask_gps/gps_server.py` | **Positioned**. Flask REST API server (`port 5000`) subscribing to `/fix` (`sensor_msgs/NavSatFix`). |
| **`index.html`** | `Desktop/Xtrmbly/dependecny/amr_dashboard/index.html` | `amr-dashboard/legacy_flask_gps/index.html` | **Positioned & Fixed**. Lightweight Leaflet.js map tracking page polling `/gps`. |

---

## 🔍 Anomalies Identified & Resolved

### 1. Leading Whitespace in Directory Names
* **Anomaly**: Directories inside `/home/ubuntu/Desktop/Xtrmbly/` were created with leading space characters (e.g., `" dependecny"` and `" ros2_ws"`).
* **Impact**: Standard terminal commands (`cd dependecny`, `colcon build`) failed with `No such file or directory` errors unless quotes or leading space escapes were explicitly supplied.
* **Resolution**: Normalized directory paths and updated workspace references.

### 2. Hardcoded IP Address in Legacy Web Tracker
* **Anomaly**: `index.html` contained hardcoded `SERVER_IP = "192.168.114.232"`.
* **Impact**: Failed silently when deployed on different networks or subnets.
* **Resolution**: Updated `index.html` to dynamically evaluate `window.location.hostname || "localhost"`.

### 3. Architectural Conflict (REST Polling vs ROSBridge WebSockets)
* **Anomaly**: `gps_server.py` + `index.html` used REST HTTP polling every 1 second to fetch `/fix` telemetry. In contrast, the production React GCS dashboard (`amr-dashboard`) uses direct WebSocket connections over ROSBridge (`ws://localhost:9090`).
* **Resolution**: Moved the Flask + HTML tracker under `amr-dashboard/legacy_flask_gps/` as a lightweight fallback utility to prevent architectural clutter.

### 4. Relocated Workspace Setup Paths in Launch Scripts
* **Anomaly**: `Desktop/Xtrmbly/launch files/amr_start/start_amr.sh` contained hardcoded source paths pointing to `~/ros2_ws/install/setup.bash`.
* **Resolution**: Updated `start_amr.sh` to include `$HOME/Desktop/Xtrmbly/ros2_ws/install/setup.bash` with fallback.

---

## 📂 Codebase Organization & Cleanup Summary

1. **Unclean / Backup Files**: Moved to `unclean/` directory:
   * `unclean/amr-dashboard/GpsPreviewMap.jsx` (Dead component)
   * `unclean/hybrid_navigation/` (`hybrid_manager_backup.py`, `hybrid_manager_v0.py`)
   * `unclean/tf_frames/` (14 legacy `frames_*.gv` and `frames_*.pdf` graph outputs)
   * `unclean/robot.txt` (Root XML fragment dump)
2. **Frontend Applications**:
   * Production React Dashboard: `amr-dashboard/`
   * Frontend V1 (Multi-app GCS): `Frontend V1/amr/gcs/` and `Frontend V1/amr-dashboard/`
3. **Documentation**: Root `README.md` and `AGENTS.md` / `agent.md` fully updated.

---

## 🚀 Execution Instructions

### Build ROS 2 Packages (including `esp32_odom` teleop)
```bash
cd ~/Desktop/Xtrmbly/ros2_ws
colcon build --symlink-install
source install/setup.bash
```

### Run Arrow Key Teleoperation
```bash
ros2 run esp32_odom arrow_teleop
```

### Run Legacy Flask GPS Server (Optional Fallback)
```bash
python3 amr-dashboard/legacy_flask_gps/gps_server.py
```
