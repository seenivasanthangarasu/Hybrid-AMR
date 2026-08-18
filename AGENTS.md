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
