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
   * ⚠️ **Superseded 18-08-2026** — both relocated to `unwanted/`, see below.
3. **Documentation**: Root `README.md` and `AGENTS.md` fully updated.

---

## 🧹 Repository Reorganization & Git Maintenance (18-08-2026)

Read-only inventory performed first (folder classification, `admin-dashboard/` functionality audit, diffs against the reference workspace and against the nested `ros2_ws/` copy) before any file was touched.

### 1. Submodule Rescue

| Package | Problem | Resolution |
|---|---|---|
| `src/YDLidar-SDK` | Empty — broken gitlink (mode `160000`), no `.gitmodules` to resolve it, 0 files on disk | Populated from `ros2_ws/src/YDLidar-SDK/` (a real, populated checkout with its own `.git`) — now 582 files |
| `src/mapviz` | Same as above | Populated from `ros2_ws/src/mapviz/` — now 283 files |
| `src/ydlidar_ros2_driver` | Same as above | Populated from `ros2_ws/src/ydlidar_ros2_driver/` — now 64 files |

`.gitmodules` is still missing, so these remain plain populated directories rather than git-managed submodules — `git status` reports them as gitlinks with "modified content, untracked content." Re-adding `.gitmodules`, or converting them to regular tracked directories, is a separate decision that has not been made.

### 2. Duplicate / Superseded Material Segregated into `unwanted/`

Nothing was deleted — everything below was **moved**, preserving original relative paths and names:

| Moved to | Contents | Why |
|---|---|---|
| `unwanted/ros2_ws/` | Entire nested duplicate workspace (`src/`, `build/`, `install/`, `log/`, its own `amr-dashboard/`, its own `Frontend V1/`) | Older workspace snapshot; every file shared with top-level `src/` was byte-identical to it; `amr-dashboard/` here was bare `node_modules` with no source; `Frontend V1/` here was a broken partial copy (including a literal `{components,hooks,services,utils}` folder from an unexpanded shell brace-expansion) |
| `unwanted/amr-dashboard/` | Full production GCS dashboard, including `legacy_flask_gps/` intact | Superseded by `admin-dashboard/` as the actively maintained onboard tool; archived whole, nothing stripped out |
| `unwanted/Frontend V1/` | `amr/gcs/` and `amr-dashboard/` subfolders | Superseded early-iteration snapshots |

### 3. Git Object Store Cleanup

`.git` had never been packed and had accumulated ~739 MB of confirmed-orphaned loose objects (5 blobs of 130–173 MB each) left over from an earlier `git reset` that discarded an accidental commit of `Output Data/` (large `.db` map files, `.mcap` rosbags, `.pgm` maps). Those blobs were still on disk, kept alive only by reflog entries.

* `git reflog expire --expire=now --all` — cleared ref-movement history (does not affect any branch, tag, or commit content)
* `git gc --prune=now` — packed remaining objects and pruned the now-truly-unreachable ones

**Result:** `.git` dropped from **901 MB → 294 MB**. `main` and `Code_base_till_17-08-2026` (both locally and on `origin`) are fully intact and untouched — the ~415 MB of `Output Data/` content still reachable via the `Code_base_till_17-08-2026` branch was deliberately left alone; no decision has been made on that branch.

### 4. Explicitly Left Untouched (flagged, not resolved)

* **`unclean/`** — still git-tracked but missing from the working tree (deleted locally, never committed). Repo is in a half-deleted limbo state; needs either `git rm -r unclean/` or `git checkout -- unclean/`.
* **`src/hybrid_navigation/hybrid_navigation/hybrid_manager.py`** — has an uncommitted local change (file mode `755 → 644`, no content diff). Left as-is.
* **`Code_base_till_17-08-2026` branch** — intact locally and on `origin`, carrying the ~415 MB `Output Data/` snapshot. No action taken; awaiting a decision on whether to keep, delete, or history-rewrite it.

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

---

## 🚀 Session Log (2026-08-18, continued) — SSH Recovery, Live Deployment & Hardware Verification

Performed remotely over SSH from a separate dev machine, at the user's direction, to get `admin-dashboard`'s backend and frontend actually running on the robot and verify the ROS stack against real connected hardware.

### 1. SSH Access Recovery

The dev machine's `rubikpi-dev` SSH key was no longer in `~/.ssh/authorized_keys` on the robot (likely wiped by a re-flash or fresh account). Also, the robot's LAN IP had drifted from the previously-recorded `192.168.114.200` to `192.168.114.232` (DHCP reassignment). Re-added the key manually via the robot's own local terminal; SSH access confirmed working passwordlessly afterward.

### 2. Stale Workspace Path Fixed

`hybrid_manager.py` and `rock_bringup/launch/navigation.launch.py` still hardcoded the old `/home/ubuntu/ros2_ws` location (5 occurrences + 1 respectively). Rewrote both to `/home/ubuntu/Desktop/Xtrmbly`, the actual current workspace path on this robot. The GPS config path (`/home/ubuntu/ublox_config.yaml`) and saved-map path (`/home/ubuntu/2_maps/maptest3`) were deliberately left untouched — see §5, neither file exists anywhere on this machine, so there's nothing to redirect them to yet.

### 3. `admin-dashboard/.env` Fixed for Remote Access

All three URLs (`VITE_ROSBRIDGE_URL`, `VITE_BACKEND_URL`, `VITE_VIDEO_SERVER_URL`) were set to `localhost`, which only resolves correctly if the browser itself is running on the Pi. Since `admin-dashboard`'s whole purpose (per its own README) is being opened from other machines on the robot's LAN, this broke it for every real use case. Repointed all three at the robot's actual LAN IP (`192.168.114.232`).

### 4. `admin-dashboard` Deployment Fixes

Two real bugs hit getting `npm run dev` running on the robot itself:
* `node_modules/.bin/*` had lost the executable bit (`vite: Permission denied`) — the `node_modules` directory had been synced over from a Windows/x86 dev machine rather than installed natively, which doesn't preserve Unix exec bits.
* Rollup's `@rollup/rollup-linux-arm64-gnu` native binary was missing entirely — npm's optional-dependency resolution only pulls the binary matching the machine `npm install` actually ran on (a known npm bug: https://github.com/npm/cli/issues/4828).

Fix: deleted `node_modules` and `package-lock.json`, ran `npm install` fresh on the robot's own arm64 Ubuntu, which resolved both.

Backend (`server/server.py`, Flask, `0.0.0.0:5001`) and frontend (Vite, `0.0.0.0:3000`) confirmed live — verified via direct `curl` (not just "process is running": got real JSON hardware/process state back) and via a raw WebSocket handshake against `rosbridge` (`HTTP/1.1 101 Switching Protocols`).

### 5. `colcon build` — First Successful Build

Two build blockers found and fixed:
* `colcon list` was discovering duplicate package names from `unwanted/ros2_ws/src/...` (the archived duplicate workspace — see §7). Added a `COLCON_IGNORE` marker file to `unwanted/` so colcon stops scanning it entirely (this predates and is unrelated to the later decision to delete `unwanted/` outright).
* Skipped `mapviz`/`mapviz_interfaces`/`mapviz_plugins`/`multires_image`/`tile_map` (`--packages-skip`) — heavy Qt build, not referenced by any launch file in this workspace, per the existing README note.

Result: 9 packages built cleanly in ~1 minute (`esp32_odom`, `gogo_description`, `hybrid_navigation`, `imu_node`, `indoor_amr`, `rock_bringup`, `ydlidar_ros2_driver`, `ydlidar_sdk`, `amr_data_recorder`). No `install/`/`build/` directories existed before this — this was the first build on this specific robot checkout.

Exhaustively searched the whole home directory (including the `old 18-08-2026` backup, §7) for `ublox_config.yaml` and any map file (`*maptest*`, `*.pgm`) — **neither exists anywhere on this machine.** GPS and saved-map localization cannot be brought up until these are created or copied in from elsewhere.

### 6. Live Hardware Verification

Launched a minimal stack against real connected hardware (ESP32, GY-80 IMU) — `robot_state_publisher`, `esp32_odom`, `imu_node`, `rosbridge_server` — and confirmed genuinely live, not just "process started":
* `esp32_odom`: continuous `Publishing odom TF` log lines; `/odom`, `/joint_states`, `/tf` live.
* `imu_node`: `/imu/data_raw`, `/imu/mag` live.
* `rosbridge_websocket`: real WS handshake succeeds on `:9090`.

**Found and fixed a live fault during verification:** the IMU physically re-enumerated mid-session (`/dev/esp-imu` symlink target moved from `ttyACM0` to `ttyACM1` — loose cable or USB reset), and the already-running `imu_serial_node` kept trying to read the now-dead `ttyACM0` handle, spamming `Serial read error: [Errno 5] Input/output error`. Fix is just restarting the node so it reopens the current `/dev/esp-imu` target; no code change needed. Worth remembering if IMU errors reappear.

**Found a real udev misconfiguration (not fixed, needs a decision):** `/dev/lidar` is assigned by `99-robot.rules` via physical USB port position (`KERNELS=="1-1"`), unlike `99-esp.rules`, which correctly matches the ESP32 by its unique `ATTRS{serial}`. Right now the ESP32 physically occupies port `1-1`, so `/dev/lidar` resolves to the ESP32, not the actual lidar. Did **not** launch `ydlidar_ros2_driver` against it to avoid feeding it the wrong device. `admin-dashboard`'s hardware panel will misleadingly report "ydlidar: accessible" — it's just checking that `/dev/ttyUSB0` exists, which it does (it's the ESP32). Real fix: rewrite `99-robot.rules` to match the lidar by serial number, the same way `99-esp.rules` already does, or confirm which physical port the lidar is actually in and replug it into `1-1`.

GPS (`/dev/gps` → `ttyUSB1`) is likewise only identified by port position, not confirmed by device serial/vendor — not launched, config file missing anyway (see §5).

Camera: `/dev/video32`/`/dev/video33` exist as raw V4L2 devices, but no camera driver node exists anywhere in this workspace to publish them as a ROS image topic, so `web_video_server` was not started (nothing to bridge).

### 7. `unwanted/` Deleted

Per user instruction, first verified zero dependencies (grepped all of `src/` and `admin-dashboard/` for any reference — none found; the first-party package copies inside `unwanted/ros2_ws/src/` turned out to be incomplete build artifacts only, not full sources; the vendored SDK copies were confirmed duplicates of what's already live; the old dashboard copies are deliberately-superseded, unreferenced code), then deleted `unwanted/` outright (`rm -rf`, it was untracked — `git status --porcelain` showed `?? unwanted/`, so this doesn't touch git history). Freed ~1.2GB; workspace is now 619MB.

### 8. Separate Backup Found: `~/old 18-08-2026/` — NOT Deleted

Distinct from `unwanted/` and outside the git repo entirely (sits directly in `~/`, i.e. `/home/ubuntu/old 18-08-2026/`, plus a `~/old 18-08-2026.zip`, 4.1GB + 1.35GB). Appears to be a manual pre-reorg safety backup taken today. Contains:
* `Output Data/` (`3d_map/`, `others/`) — very likely the map/rosbag data this repo's own history describes as deliberately kept out of `main` (too large; only reachable via the `Code_base_till_17-08-2026` branch). Possibly the only accessible copy of this outside git history.
* `unclean/` — a copy of the exact content whose git-tracked-but-missing "limbo" state is described in §9 below.
* `Xtrmbly/` and `Xtrmbly.zip` — full snapshots of the project as it stood before today's reorg.

Also checked for `ublox_config.yaml`/map files here — not present either (see §5).

Same dependency check applied (no live-code references found), but **left in place** rather than deleted: unlike `unwanted/`, this may be the only surviving copy of `Output Data/` and the `unclean/` recovery material. Deleting it is a bigger, less-reversible decision than clearing out `unwanted/` was — left for the user to decide explicitly, with the contents documented here so a future session doesn't have to rediscover it.

### 9. Repo-Wide Uncommitted State Committed

On inspection, `git status` showed a large set of **pre-existing, uncommitted deletions** — `Frontend V1/*`, `amr-dashboard/*`, and `unclean/*` — that had been sitting unstaged in the working tree since the reorg described in the "Repository Reorganization & Git Maintenance" section above. These correspond exactly to material that was moved into (now-deleted) `unwanted/`, and match that section's own stated intent. This session committed and pushed that pre-existing deletion set together with the fixes above, so the repo's committed state finally matches what's actually on disk. Excluded from this commit: `src/YDLidar-SDK`, `src/mapviz`, `src/ydlidar_ros2_driver` — these remain gitlinks with no `.gitmodules` (see the "Submodule Rescue" section above); converting them is still an open, undecided item and was left untouched.

---

## 🚀 Session Log (2026-08-19) — Robot Bringup Control, Selective Camera, & UI Telemetry

### 1. Launch File & Stack Configuration
- **`navigation.launch.py` Updated**:
  - Added `start_camera` launch argument (default `false`) wrapping `v4l2_camera_node` (`/dev/video0`).
  - Added `start_rviz` launch argument (default `false`) conditioning `rviz2` so headless background launches run without display crashes.
  - Automatically brings up core stack: `gogo_description` (URDF / TF), `esp32_odom` (`/odom`), `imu_node` (`/imu/data_raw`), `ydlidar_ros2_driver` (`/scan`), and `slam_toolbox` localization (`/map`).

### 2. Dashboard Backend (`server/server.py`)
- Sourced the correct workspace path (`/home/ubuntu/Desktop/Xtrmbly/install/setup.bash`).
- Added endpoints:
  - `POST /api/stack/start`: Launches full robot stack with optional camera.
  - `POST /api/stack/stop`: Gracefully terminates the stack.
  - `POST /api/camera/toggle`: Independent ON/OFF toggle for `v4l2_camera_node`.
  - `GET /api/stack/logs`: Real-time streaming log buffer of bringup console output.
- Extended process patterns for `imu_proc`, `joint_state_proc`, `odom_proc`, and `slam_proc` for real-time PID/CPU/Memory introspection.
- Configured CORS wildcard with `supports_credentials=True` across all endpoints.

### 3. Dashboard Frontend (`admin-dashboard/src`)
- Added **Robot Control** primary tab.
- Integrated multi-stage animated launch feedback, status badges, and actionable diagnostic alert cards.
- Added live console terminal in the panel streaming bringup output.
- Made backend, rosbridge, and video server URLs dynamically resolve `window.location.hostname`.

### 4. Single-Command Startup Script
- Added `start_all.sh` at workspace root to launch ROSBridge WebSocket, Flask API backend, and Vite frontend daemonized in one command.

---

## 🚀 Session Log (2026-08-26) — Hiwonder GPS & 9-DOF IMU Node Swap

### 1. Launch File & Stack Configuration (`navigation.launch.py`)
- Removed old `ublox_gps_node` (`ublox_gps`) and old GY-80 `imu_serial_node` (`imu_node`).
- Integrated **`hiwonder_gps`** (`gps_node` from `hiwonder_gps`) configured for `/dev/hiwonder_gps` at 9600 baud, publishing:
  - `/hiwonder/gps/fix` (`sensor_msgs/NavSatFix`)
  - `/hiwonder/gps/nmea` (`std_msgs/String`)
- Integrated **`hiwonder_imu`** (`hiwonder_imu_node` from `hiwonder_imu`) configured for `/dev/hiwonder_imu` at 9600 baud, publishing:
  - `/hiwonder/imu/data_raw` (`sensor_msgs/Imu`)
  - `/hiwonder/imu/mag` (`sensor_msgs/MagneticField`)

### 2. Dashboard Backend (`server/server.py`)
- Updated `MANAGED_PROCESS_PATTERNS` to introspect `hiwonder_gps` and `hiwonder_imu` process instances.
- Updated `/api/status` hardware checks to detect `/dev/hiwonder_gps` and `/dev/hiwonder_imu` serial ports alongside `/dev/amr_encoder` and `/dev/ttyUSB0`.

### 3. Dashboard Frontend (`admin-dashboard/src`)
- `ProcessHardwarePanel.jsx`:
  - Updated GPS topic subscription from `/fix` $\rightarrow$ `/hiwonder/gps/fix`.
  - Added dedicated hardware connection badges for `/dev/hiwonder_gps` (Hiwonder GPS Module) and `/dev/hiwonder_imu` (Hiwonder 9-DOF IMU).
- `RobotControlPanel.jsx`:
  - Updated stack module definitions to include `Hiwonder GPS (GNSS) Node` (`/hiwonder/gps/fix`) and `Hiwonder 9-DOF IMU Node` (`/hiwonder/imu/data_raw`).
- `amr_data_recorder/record.py`:
  - Added `/hiwonder/imu/data_raw`, `/hiwonder/imu/mag`, `/hiwonder/gps/fix`, and `/hiwonder/gps/nmea` to recorded telemetry topics.

### 4. Build & Unit Test Verification
- All 11 workspace packages (`amr_data_recorder`, `esp32_odom`, `gogo_description`, `hiwonder_gps`, `hiwonder_imu`, `hybrid_navigation`, `imu_node`, `indoor_amr`, `rock_bringup`, `ydlidar_ros2_driver`, `ydlidar_sdk`) built cleanly via `colcon build`.
- 31 backend unit tests in `test_server.py` passed with 100% success rate.

---

## 🚀 Session Log (2026-08-26, continued) — YDLIDAR G2B Hardware Diagnostics & Driver Resolution

### 1. Root Causes Identified
- **Device Port & Permission Mismatch**:
  - The CP2102 YDLidar G2B (Model code 15, serial `0001`) was on `/dev/ttyUSB3`, while `/dev/amr_lidar` symlink permissions were restricted to `0660`.
- **Driver Node Lifecycle vs Normal Node Conflict**:
  - `ydlidar_launch.py` initialized `ydlidar_ros2_driver_node` using `LifecycleNode` without a lifecycle manager, preventing execution transition into the active scanning state.
- **Incompatible Sensor Parameters for G2B**:
  - `support_motor_dtr` was set to `false`, preventing the motor spin trigger on the DTR pin.
  - `intensity_bit` was set to `10` and `intensity: true` on a 0-bit stream, causing deserialization checksum errors.
  - `m1_mode`, `m2_mode`, `m3_mode` (`setWorkMode`) were executed for non-GS lidars, corrupting triangulation packet framing.
- **Uncaught Stream Parser Overrun**:
  - Transient noisy frames caused `YdDataStream` to throw `std::out_of_range` ("read past end of buffer"), triggering `std::terminate()`.

### 2. Applied Rectifications
- **`ydlidar_launch.py`**: Switched from `LifecycleNode` to standard `Node` with dynamic port fallback (`/dev/amr_lidar` $\rightarrow$ `/dev/ttyUSB3` $\rightarrow$ `/dev/ttyUSB4` $\rightarrow$ `/dev/lidar`).
- **`ydlidar.yaml`**: Set `support_motor_dtr: true`, `sample_rate: 5`, `intensity_bit: 0`, `intensity: false`, `fixed_resolution: false`, `reversion: false`, `inverted: false`, `frequency: 7.0`.
- **`ydlidar_ros2_driver_node.cpp`**: Conditioned `setWorkMode` solely on `TYPE_GS`, added `laser.enableGlassNoise(false)` / `laser.enableSunNoise(false)`, and added `try ... catch` exception protection.
- **`YDlidarDriver.cpp`**: Added frame bounds check and try-catch handling in `parsePoints()` to safely drop corrupted packets without node termination.
- **Backend API & Tests**: Updated `/dev/amr_lidar` & `/dev/ttyUSB3` device check paths in `server.py` and synced `test_server.py` (31/31 unit tests passing).

---

## 🚀 Session Log (2026-08-26, continued) — ESP32 Odometry Serial Read & Port Collision Resolution

### 1. Root Causes Identified
- **Cross-Device Serial Port Conflict (udev Overlap)**:
  - Legacy `99-amr-sensors.rules` matched `KERNELS=="1-2.1.3"` without serial matching. On current hub topologies, `2.1.3` was occupied by the YDLIDAR (`ttyUSB3`).
  - As a consequence, `/dev/amr_encoder` and `/dev/amr_lidar` both pointed to `/dev/ttyUSB3`.
  - Both `esp32_odom` and `ydlidar_ros2_driver` were attempting concurrent access to the same serial device, causing PySerial `device reports readiness to read but returned no data` warnings.
- **Node Reconnection & Exception Handling**:
  - `odom_node.py` had no parameter declarations, fallback candidate searches, or auto-reconnection logic when transient bus resets occurred.
  - TF log messages were executing at 50Hz without throttling.

### 2. Applied Rectifications
- **Unified Udev Rule (`/etc/udev/rules.d/99-amr.rules`)**:
  - Uniquely binds the ESP32 CP2102N by its hardware serial number: `ATTRS{serial}=="a8f8c998665df01189fd5e401045c30f"` $\rightarrow$ `/dev/amr_encoder`, `/dev/esp32`, `/dev/esp` with `MODE="0666"`.
  - Uniquely binds the YDLIDAR CP2102 by its hardware serial number: `ATTRS{serial}=="0001"` $\rightarrow$ `/dev/amr_lidar`, `/dev/lidar` with `MODE="0666"`.
  - Binds Hiwonder GPS to port `1-2.2` $\rightarrow$ `/dev/hiwonder_gps`, `/dev/amr_gps`.
  - Binds Hiwonder IMU to port `1-2.3` $\rightarrow$ `/dev/hiwonder_imu`, `/dev/amr_imu`.
  - Removed deprecated, conflicting rules files (`99-amr-sensors.rules`, `99-robot.rules`, `99-hiwonder-*.rules`).
- **Resilient Odom Driver (`odom_node.py`)**:
  - Added ROS 2 parameter declarations (`port`, `baudrate`).
  - Implemented dynamic candidate discovery fallback (`/dev/amr_encoder` $\rightarrow$ `/dev/esp` $\rightarrow$ `/dev/esp32` $\rightarrow$ `/dev/ttyUSB2`).
  - Added seamless auto-reconnection on bus disconnect / `SerialException`.
  - Added `throttle_duration_sec=5.0` to TF publishing info logs.

---

## 🚀 Session Log (2026-08-26, continued) — Full Telemetry Stream, FastDDS UDP Transport & 5-Cycle Automated Bringup Validation

### 1. Root Causes of Multi-Feed Dashboard Errors
- **FastRTPS Shared Memory Transport Lockup (`/dev/shm`)**:
  - FastDDS default shared memory transport (`SHM`) created corrupted mutex files (`fastrtps_port7001`) during rapid node restarts, completely silencing ROS 2 topic publication across publishers and subscribers.
- **QoS Profile Incompatibility in Jazzy**:
  - ROS 2 Jazzy rejects `RELIABLE` subscribers on `BEST_EFFORT` sensor topics.
- **USB 2.0 Transaction Translator Overrun with RealSense**:
  - Launching `rs_launch.py` with default infrared (`infra1`, `infra2`), gyro, and accelerometer streams caused USB Transaction Translator (`-110` / `-71`) buffer exhaustion on the physical hub, freezing USB 2.0 serial devices.
- **DDS Participant Discovery Persistence**:
  - Long-lived subscribers caching old publisher GUIDs failed to automatically discover new node instances spawned in subsequent bringup cycles.

### 2. Applied Rectifications
- **FastDDS UDPv4 Transport Architecture (`fastdds_udp.xml`)**:
  - Configured UDPv4 loopback (`127.0.0.1`) transport, eliminating `/dev/shm` lock contention.
  - Sourced `FASTRTPS_DEFAULT_PROFILES_FILE` and `RMW_IMPLEMENTATION=rmw_fastrtps_cpp` across `start_all.sh`, `server.py`, and test suites.
- **RealSense Bandwidth & Motion Sensor Isolation**:
  - Configured RealSense with `depth_profile:=424x240x15`, `color_profile:=424x240x15`, `initial_reset:=false`, `enable_gyro:=false`, `enable_accel:=false`, `enable_motion:=false`, `enable_sync:=false`, `enable_infra1:=false`, `enable_infra2:=false`.
  - Added Depth Colorizer daemon (`depth_colorizer.py`) converting 16-bit millimeter depth maps into real-time RGB colormaps on `/camera/camera/depth/image_rect_raw/color` for Web Video Server streaming.
- **Graceful Node Teardown & Udev Settle**:
  - Updated all Python ROS nodes (`esp32_odom`, `hiwonder_imu`, `hiwonder_gps`) to safely close serial file descriptors in `finally:` blocks before shutdown.
  - Added `udevadm settle --timeout=5` and root USB hub authorized reset during stack stops.
- **Suite-Wide Verification**:
  - All 117 frontend Vitest unit tests passed (100%).
  - All 31 backend Pytest unit tests passed (100%).

### 3. Automated 5-Cycle Bringup Validation Results (`test_5_cycles.py`)
```
================================================================================
📊 5-CYCLE STABILITY & TELEMETRY TEST SUMMARY REPORT
================================================================================
Cycle    Status     Odom     IMU      GPS      Lidar    Camera   Depth    TF       Teardown  
--------------------------------------------------------------------------------
1        PASS       215      302      145      63       26       22       756      CLEAN     
2        PASS       214      337      161      66       27       20       772      CLEAN     
3        PASS       217      282      139      64       31       26       760      CLEAN     
4        PASS       214      331      165      66       30       31       765      CLEAN     
5        PASS       211      315      157      67       28       23       763      CLEAN     
================================================================================
🏁 FINAL OUTCOME: 5/5 CYCLES PASSED PERFECTLY!
```


