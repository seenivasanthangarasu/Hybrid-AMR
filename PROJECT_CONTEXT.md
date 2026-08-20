# HYBRID AMR — FULL PROJECT CONTEXT

> Reference document describing the technology stack, packages, architecture, data
> contracts and known issues of a hybrid (indoor/outdoor) Autonomous Mobile Robot
> project. Written to be used as background context for an LLM assistant.
> Everything below was derived by reading the actual source tree.
>
> **Scope note:** this repo is the client-side operator dashboard
> (`amr-dashboard/`) only. Sections 2.1, 3–4, 7 (robot/backend) document the
> companion ROS 2 robot workspace this dashboard is built to talk to. That
> workspace runs on the robot itself, in its own separate repo/workspace —
> it is not tracked here and never was; these sections are kept as
> historical reference for the interface this dashboard was built against.
> Section 5 (the ROS 2 interface contract) and section 6 (the dashboard
> itself) are what's actually live in this repo.

---

## 1. ONE-PARAGRAPH SUMMARY

This is a **hybrid indoor/outdoor Autonomous Mobile Robot (AMR)** built on **ROS 2 Jazzy**.
A differential-drive robot ("gogo") uses an **ESP32 microcontroller** for wheel
odometry and motor commands over serial, a **YDLidar** 2D laser scanner for
mapping/localization, a **u-blox GPS** for outdoor positioning, and a
**RealSense-style depth camera** for video. `slam_toolbox` provides indoor
SLAM/localization. A supervisor node (`hybrid_manager`) watches GPS validity and
switches the robot between **GPS_MODE** (outdoor) and **SLAM_MODE** (indoor) by
starting/stopping the relevant node stacks. Operators drive and monitor the robot
through **a browser-based ground control station** (React + Vite + Tailwind) that
talks to ROS 2 exclusively over **rosbridge WebSocket** using **roslibjs** — there
is no REST API and no mock data layer anywhere in the frontend.

---

## 2. TECHNOLOGY STACK

### 2.1 Robot / backend

| Layer | Technology |
|---|---|
| Middleware | **ROS 2 Jazzy Jalisco** (confirmed: `source /opt/ros/jazzy/setup.bash` hardcoded in `hybrid_manager.py`) |
| Host OS | **Ubuntu 24.04 LTS (Noble)** — inferred from Jazzy + `__pycache__` files compiled as `cpython-312` (Python 3.12) |
| Build system | **colcon** with `ament_python` for all first-party packages; `ament_cmake` for the vendored lidar driver |
| Language (nodes) | **Python 3.12** via `rclpy` |
| Language (drivers) | **C++** (YDLidar SDK + ROS 2 driver, mapviz) |
| SLAM / localization | **slam_toolbox** (Ceres solver backend) |
| Robot model | **URDF via xacro**, published by `robot_state_publisher` |
| Simulation | **Gazebo (ros_gz / gz_sim)** via `ros_gz_bridge` — launch file exists but simulation is not the primary path |
| Visualization (native) | **RViz2**, **mapviz** (vendored) |
| Serial I/O | **pyserial** (`serial.Serial`) for the ESP32 link |
| Robot↔web bridge | **rosbridge_server** (WebSocket, port 9090) |
| Video bridge | **web_video_server** (MJPEG over HTTP, port 8080) |

### 2.2 Operator dashboard / frontend

| Layer | Technology |
|---|---|
| Framework | **React 18.3** |
| Build tool | **Vite 5.3** (dev server on port 5173, `host: true`) |
| Styling | **TailwindCSS 3.4** + PostCSS + Autoprefixer, custom dark "deck" theme |
| ROS transport | **roslib (roslibjs) 1.4.1** over rosbridge WebSocket |
| Outdoor map | **Leaflet 1.9.4** + **react-leaflet 4.2.1** + OpenStreetMap tiles |
| 3D robot view | **ros3d 1.1.0** + **three.js 0.160** (UMD build, expects `window.THREE`) |
| LiDAR + SLAM rendering | **Canvas2D** (deliberately no WebGL for these views) |
| Layout | **react-grid-layout 1.4.4** (declared as a dependency) |
| Fonts | JetBrains Mono / IBM Plex Mono / Inter (Google Fonts CDN) |

### 2.3 Hardware

| Component | Detail |
|---|---|
| Compute | Single-board Linux computer, user `ubuntu`, workspace at `/home/ubuntu/ros2_ws` |
| MCU | **ESP32** — wheel encoders + motor driver, connected at `/dev/esp` (udev symlink), **115200 baud** |
| LiDAR | **YDLidar** — `/dev/ttyUSB0`, **230400 baud**, `lidar_type: 1`, `device_type: 0`, 10 Hz, range 0.1–16.0 m, frame `laser_frame`, `reversion: true`, `inverted: true` |
| GPS | **u-blox** receiver via `ublox_gps` package, config at `/home/ubuntu/ublox_config.yaml` |
| Camera | Depth camera publishing `/camera/camera/color/image_raw` (Intel RealSense default namespace pattern) |
| Drive | Differential drive, wheel separation ≈ **0.1674 m** (wheels at y = ±0.0837), base mass ≈ **4.3 kg** |

---

## 3. REPOSITORY LAYOUT

This repo is client-only — the operator dashboard, nothing else:

```
ros2_ws/
├── amr-dashboard/                    ← React operator ground control station (the app)
├── architecture.drawio               system architecture diagram (draw.io)
└── docs/                             UI guide, remediation specs
```

The ROS 2 colcon workspace described in sections 4 and 7 below runs on the
robot itself, in its own separate workspace/repo — it has never been hosted
in this repo's working tree. Those sections are kept as historical reference
for the packages, topics, and behavior the interface contract in §5 was
built against; treat package names and file paths in §4 and §7 as
describing the robot's own repo, not anything present here.

---

## 4. ROS 2 PACKAGES — DETAIL

### 4.1 `esp32_odom` (ament_python)

Single node: `odom_node` → class `ESP32OdomNode`, node name `esp32_odom`.
Declared deps: `rclpy`, `nav_msgs`, `geometry_msgs`, `tf2_ros`.
(Note: `sensor_msgs` and `python3-serial` are imported but **not declared** in
`package.xml`.)

**Serial protocol (custom ASCII, newline-terminated):**

- **Inbound (ESP32 → ROS)**, read at 50 Hz (20 ms timer):
  ```
  ODOM,<x>,<y>,<theta>,<v>,<w>,<left_ticks>,<right_ticks>
  ```
  Exactly 8 comma-separated fields; anything else is logged as `Bad ODOM packet`.
  Lines not starting with `ODOM` are silently dropped.

- **Outbound (ROS → ESP32)**, on every `/cmd_vel` message:
  ```
  CMD,<linear.x:.3f>,<angular.z:.3f>
  ```

**Behavior:**
- Publishes `nav_msgs/Odometry` on `/odom` (`header.frame_id="odom"`, `child_frame_id="base_link"`).
  Pose x/y and yaw come straight from the ESP32; yaw → quaternion via `sin(θ/2)`, `cos(θ/2)`.
- Broadcasts the **`odom` → `base_link`** TF (this is the only dynamic TF in the system).
- Publishes `sensor_msgs/JointState` on `/joint_states` with names
  `["wheel_left_joint", "wheel_right_joint"]` and positions = `ticks * 0.01`.
- Subscribes `geometry_msgs/Twist` on `/cmd_vel`.
- Ignores all serial input for the first **3 seconds** after startup (ESP32 boot settling).
- Port and baud are **hardcoded** (`/dev/esp`, 115200) — not ROS parameters.

### 4.2 `gogo_description` (ament_python)

Robot model. Deps: `xacro`, `rviz2`, `robot_state_publisher`, `joint_state_publisher`,
`joint_state_publisher_gui`.

```
urdf/gogo.xacro          main model
urdf/gogo.gazebo         Gazebo plugin block
urdf/gogo.ros2control    ros2_control hardware description
urdf/materials.xacro
meshes/*.stl             base_link, left_wheel_1, right_wheel_1,
                         lidar_link_1, camera_link_1, imu_link_1  (mm → scale 0.001)
config/display.rviz, gazebo.rviz, ros_gz_bridge_gazebo.yaml
```

**Kinematic tree:** `base_link` is the root; `left_wheel_link`, `right_wheel_link`,
`lidar_link_1`, `camera_link_1` (and an IMU link) attach to it.

⚠️ **Important quirk:** the wheel joints `wheel_left_joint` / `wheel_right_joint` are
declared **`type="fixed"`**, yet `esp32_odom` publishes JointState positions for them.
Fixed joints cannot rotate, so the wheels never visually spin. They should be
`type="continuous"` with an axis for the joint states to have any effect.

**Launch files:**
- `robot_state_publisher.launch.py` — `robot_state_publisher` (xacro → `/robot_description`) + `joint_state_publisher`
- `display.launch.py` — the above + RViz2, with a `gui` argument toggling `joint_state_publisher_gui`
- `gazebo.launch.py` — `gz_sim` with `empty.sdf`, spawns robot at z=0.32 via `ros_gz_sim create`, bridges topics with `ros_gz_bridge parameter_bridge`

### 4.3 `hybrid_navigation` (ament_python) — THE CORE SUPERVISOR

Single node: `hybrid_manager`. Three versions exist in the tree:
`hybrid_manager.py` (current), `hybrid_manager_v0.py`, `hybrid_manager_backup.py`.

**`package.xml` declares NO runtime dependencies** — only test deps. It uses `rclpy`
and `sensor_msgs` undeclared.

**State machine:**

```
              start
                │
                ▼
         ┌─────────────┐   GPS fix valid (lat≠0 and lon≠0)
         │ GPS_SEARCH  │──────────────────────────────────┐
         │ (30s timer) │                                  │
         └──────┬──────┘                                  ▼
                │ 30 s elapsed, no fix              ┌──────────┐
                ▼                                   │ GPS_MODE │
         ┌────────────┐   GPS recovered             └────┬─────┘
         │ SLAM_MODE  │◄─────────────────────────────────┘
         │            │───────────────────────────► GPS lost
         └────────────┘        (fix becomes invalid)
```

- Subscribes `/fix` (`sensor_msgs/NavSatFix`), 1 Hz supervisory timer.
- "Valid fix" test is `latitude != 0.0 and longitude != 0.0` — it does **not** read
  `msg.status.status`, so a NO_FIX message with non-zero garbage coordinates would
  count as valid.
- On startup immediately launches the GPS node.

**Process management (the notable architectural choice):** the manager does **not**
use ROS 2 lifecycle nodes or launch composition. It shells out with
`subprocess.Popen(['/bin/bash', '-c', 'source /opt/ros/jazzy/setup.bash && source /home/ubuntu/ros2_ws/install/setup.bash && ros2 ...'])`.

Managed processes:

| Handle | Command |
|---|---|
| `gps_proc` | `ros2 run ublox_gps ublox_gps_node --ros-args --params-file /home/ubuntu/ublox_config.yaml` |
| `urdf_proc` | `ros2 launch gogo_description robot_state_publisher.launch.py` |
| `lidar_proc` | `ros2 launch ydlidar_ros2_driver ydlidar_launch.py` |
| `odom_proc` | `ros2 run esp32_odom odom_node` |
| `slam_proc` | `ros2 launch slam_toolbox online_sync_launch.py` |
| `rviz_proc` | `rviz2` |

`start_slam_stack()` starts them in order with **blocking `time.sleep()` calls**
(3 s → 5 s → 3 s → 3 s ≈ 14 s total) inside the ROS callback thread, which stalls
the executor. Cleanup calls `proc.terminate()` on each handle.

⚠️ Paths (`/home/ubuntu/...`) and the ROS distro (`jazzy`) are hardcoded in shell
strings — this node will not run on a differently-configured machine.

⚠️ Processes are only ever started, never stopped on transition back to GPS_MODE
(the handles are non-`None` so re-entry is a no-op, but nothing is killed).

### 4.4 `indoor_amr` (ament_python) — MAPPING MODE

No nodes; a launch package only. `indoor_amr_launch.py` uses `TimerAction` to
stagger startup:

| t | Action |
|---|---|
| 0.0 s | `esp32_odom/odom_node` |
| 2.0 s | `tf2_ros static_transform_publisher` → `base_link` → `laser_frame` at `(0, 0, 0.02)`, zero rotation |
| 5.0 s | include `ydlidar_ros2_driver/ydlidar_launch.py` |
| 8.0 s | include `slam_toolbox/online_async_launch.py` with `use_sim_time:=false`, `odom_frame:=odom`, `base_frame:=base_link`, `map_frame:=map` |

This is **`online_async` = SLAM mapping mode** (build a new map).

⚠️ The static TF here places the lidar 2 cm above `base_link`, but the URDF
(`gogo.xacro`) places `lidar_link_1` at `(0.034, 0, 0.1771)`. Two different lidar
mountings exist in the codebase, and the frame names differ (`laser_frame` vs
`lidar_link_1`). If both `robot_state_publisher` and this static publisher run at
once, the TF tree is inconsistent.

### 4.5 `rock_bringup` (ament_python) — LOCALIZATION MODE (newest)

The most recent addition — production bringup that runs against a **pre-built map**.
Deps: `launch`, `launch_ros`. Maintainer email differs from other packages
(`seenivasanthangarasu@gmail.com`).

`launch/navigation.launch.py` starts, with no timers/ordering:
1. include `gogo_description/robot_state_publisher.launch.py`
2. include `ydlidar_ros2_driver/ydlidar_launch.py`
3. `esp32_odom/odom_node`
4. include `slam_toolbox/localization_launch.py` with
   - `slam_params_file:=/home/ubuntu/ros2_ws/src/rock_bringup/config/mapper_localization.yaml`
   - `map_file_name:=/home/ubuntu/2_maps/maptest3`
5. `rviz2`

**Key difference from `indoor_amr`:** `localization_launch` + `mode: localization`
means **localize against a saved map**, not build one.

⚠️ `setup.py` has `packages=[]` and does not install `config/`, so the
`mapper_localization.yaml` referenced by the launch file is read from the **source
tree by absolute path**, not from the install share directory.

**`config/mapper_localization.yaml`** — slam_toolbox parameters:
```yaml
solver_plugin: solver_plugins::CeresSolver
ceres_linear_solver: SPARSE_NORMAL_CHOLESKY
ceres_preconditioner: SCHUR_JACOBI
ceres_trust_strategy: LEVENBERG_MARQUARDT
mode: localization
odom_frame: odom ; map_frame: map ; base_frame: base_link ; scan_topic: /scan
resolution: 0.05                  # 5 cm map cells
max_laser_range: 20.0
transform_publish_period: 0.02    # 50 Hz map→odom TF
map_update_interval: 5.0
minimum_travel_distance: 0.5 ; minimum_travel_heading: 0.5
do_loop_closing: true
loop_search_maximum_distance: 3.0
stack_size_to_use: 40000000
```

### 4.6 `ydlidar_ros2_driver` + `YDLidar-SDK` (vendored, submodules)

`ydlidar_launch.py` starts a **`LifecycleNode`** named `ydlidar_ros2_driver_node`
in namespace `/`, parameterized by `params/ydlidar.yaml`. Because it is a lifecycle
node it must be transitioned to `configure` → `activate` before it publishes;
nothing in the launch files does this explicitly, so it relies on the driver's
internal auto-activation.

Active config (`params/ydlidar.yaml`):
```yaml
port: /dev/ttyUSB0     baudrate: 230400
frame_id: laser_frame  lidar_type: 1   device_type: 0
sample_rate: 9         frequency: 10.0
range_min: 0.1         range_max: 16.0
angle_min: -180.0      angle_max: 180.0
reversion: true        inverted: true
auto_reconnect: true   isSingleChannel: false   intensity: false
invalid_range_is_inf: false
```
Presets for many other models ship alongside: G1/G2/G4/G6, GS2/GS5, TEA, TG,
Tmini, Tmini-Plus-SH, X2/X3/X4/X4-Pro, sdm15.

### 4.7 `mapviz` (vendored, submodule)

Qt-based 2D map visualization (satellite/tile overlay for outdoor navigation).
Heavy C++ build. Not referenced by any launch file in this workspace.

---

## 5. ROS 2 INTERFACE CONTRACT

### 5.1 Topics — robot side

| Topic | Type | Publisher | Subscriber(s) |
|---|---|---|---|
| `/odom` | `nav_msgs/Odometry` | `esp32_odom` | slam_toolbox, dashboard |
| `/joint_states` | `sensor_msgs/JointState` | `esp32_odom` | `robot_state_publisher` |
| `/cmd_vel` | `geometry_msgs/Twist` | teleop / Nav2 / dashboard e-stop | `esp32_odom` |
| `/scan` | `sensor_msgs/LaserScan` | `ydlidar_ros2_driver_node` | slam_toolbox, dashboard |
| `/fix` | `sensor_msgs/NavSatFix` | `ublox_gps_node` | `hybrid_manager`, dashboard |
| `/map` | `nav_msgs/OccupancyGrid` | slam_toolbox | dashboard |
| `/tf` | `tf2_msgs/TFMessage` | `esp32_odom`, slam_toolbox, `robot_state_publisher` | everything |
| `/tf_static` | `tf2_msgs/TFMessage` | `robot_state_publisher`, `static_transform_publisher` | everything |
| `/robot_description` | `std_msgs/String` (URDF XML) | `robot_state_publisher` | RViz, dashboard URDF widget |
| `/camera/camera/color/image_raw` | `sensor_msgs/Image` | camera driver | `web_video_server`, dashboard |
| `/robot_mode` | `std_msgs/String` `INDOOR`\|`OUTDOOR` | **NOT IMPLEMENTED** | dashboard |

### 5.2 Topics — dashboard → robot (operator commands)

These are **published by the frontend but no ROS node currently subscribes to
them.** They define an intended interface, not a working one.

| Topic / Action | Type | UI trigger |
|---|---|---|
| `/mission_state_cmd` | `std_msgs/String` (`START`/`PAUSE`/`RESUME`/`STOP`) | Control Panel buttons |
| `/emergency_stop` | `std_msgs/Bool` | EMERGENCY STOP (two-click confirm) |
| `/cmd_vel` | `geometry_msgs/Twist` | zeroed on e-stop |
| `/mission_goal` | `amr_msgs/MissionGoal` (**custom msg — package does not exist**) | legacy single-goal path (`sendGoal`, no longer wired to a button) |
| `/follow_gps_waypoints` | `nav2_msgs/action/FollowGPSWaypoints` | Mission Planner SEND ROUTE (multi-waypoint) |
| `/navigate_to_pose` | `nav2_msgs/action/NavigateToPose` | STOP (cancel), RETURN HOME |

> **Protocol caveat for all three action entries.** roslib 1.4.1's `ActionClient`
> implements **ROS1 actionlib** — it publishes to `<name>/goal` with an
> actionlib_msgs-style wrapper. A ROS2 action server exposes no such topic, so
> these will not reach Nav2 even once Nav2 is deployed. Wiring the robot side
> means switching them to rosbridge's ROS2 action op
> (`ros.callOnConnection({ op: 'send_action_goal', action, action_type, args })`)
> or to a roslib build with ROS2 action support.

### 5.3 TF tree

Design intent:
```
map ──(slam_toolbox)──► odom ──(esp32_odom)──► base_link ──(robot_state_publisher, static)──► laser_frame / lidar_link_1
                                                                                            ├─► left_wheel_link
                                                                                            ├─► right_wheel_link
                                                                                            ├─► camera_link_1
                                                                                            └─► imu_link_1
```

Captured `view_frames` output in the repo confirms real recorded trees:
- Full run: `map → odom` @ 9.83 Hz, `odom → base_link` @ 20.2 Hz, `base_link → laser_frame` static
- Degraded run: only `odom → base_link` @ 20.15 Hz — no `map` frame, i.e. SLAM was not running

---

## 6. THE DASHBOARD (`amr-dashboard`)

Product name: **"Hybrid AMR Command Center"** (`hybrid-amr-command-center` v1.0.0).

### 6.1 Governing design principle

The README states it explicitly, and the code holds to it: **no mock data, no
simulated telemetry, no REST polling.** Every widget is a live ROS subscriber. If a
topic has no live publisher, the widget renders `NO DATA` rather than a placeholder
or an interpolated value.

### 6.2 Architecture

```
main.jsx
 └── <MissionProvider>            two contexts: mission route (waypoints, selection,
      │                          routeInfo) + mapApi (Leaflet handle), split so map
      │                          mount/unmount and route edits don't re-render each other
      └── <App>
           ├── <Header>            connection status + mode badge
           ├── MAIN VIEW           swaps: GpsMapView | SlamView | LidarView | CameraView
           ├── <StatusPanel> <MissionPlanner> <ControlPanel>
           └── RIGHT RAIL          GPS preview · LiDAR preview · Camera preview · URDF widget
```

**Main-view selection logic (`App.jsx`):** `mainView` is `'auto'` by default.
In auto, `mode === 'INDOOR'` → SLAM view, otherwise → GPS view. Clicking any
preview panel pins that view. Any change to `mode` resets the pin back to auto.

### 6.3 Services

**`RosConnectionService.js`** — singleton, the single source of truth for the
WebSocket. URL from `import.meta.env.VITE_ROSBRIDGE_URL`, default `ws://localhost:9090`.
Status machine: `disconnected | connecting | connected | error | closed`.
Maintains a `topicCache` keyed `name::messageType` so multiple components share one
underlying subscription. Exposes `getTopic`, `getService`, `getActionClient`,
`getTopicList` (used for camera auto-detection) and an `onStatusChange` listener set.

**`RobotCommandService.js`** — all operator write paths. Publishes the command
topics in §5.2. `emergencyStop()` publishes `Bool(true)` on `/emergency_stop` **and**
a zero `Twist` on `/cmd_vel`. Its own comments note that e-stop should be wired to a
hardware interlock, not software velocity zeroing alone, and that lat/lon → map-frame
conversion is deliberately left as a robot-side integration point rather than being
computed client-side.

**`McapStorageService.js`** — folder picker (`window.showDirectoryPicker`) +
`FileSystemDirectoryHandle` persistence in IndexedDB (not `localStorage` —
handles aren't JSON-serializable). `verifyPermission()` re-checks/re-requests
write permission, since a stored handle can lose its grant across sessions.

**`McapRecordingService.js`** — singleton. Subscribes to a configurable topic
set through `RosConnectionService.getTopic()` (shared cache, no parallel
subscription path) and writes `.mcap` files via `@mcap/core`, JSON-encoded
(rosbridge already delivers JS objects — no CDR serializer). State machine
`idle → recording → rotating → recording → stopped`, plus `paused` while the
rosbridge link is down: writes are suspended (not corrupted) and an explicit
gap-marker message is written on both the pause and the resume. All writes —
messages, gap markers, rotation's close+reopen — are serialized through one
queue, since `McapWriter` forbids concurrent calls.

**`CameraSnapshotService.js`** — singleton. Periodically draws a frame from
the `web_video_server` MJPEG stream onto an offscreen canvas and writes it as
a JPEG into a `camera/` subfolder. The first capture attempt doubles as a
feature-detection probe for the tainted-canvas `SecurityError` that occurs
until the robot-side CORS change in `docs/server-side-requests.md` lands; on
that error the service goes to `unavailable` rather than silently producing
zero images.

**`BackupRotationService.js`** — filename scheme (`prefix-YYYYMMDD-HHMMSS.ext`)
and retention enforcement (delete oldest beyond N), shared by the two services
above rather than duplicated in each.

**`Nav2ParameterService.js`** — `getParameters(names)` / `getParameter(name)` /
`setParameter(name, value)` over `rcl_interfaces/srv/GetParameters`/
`SetParameters`, targeted at a robot-side whitelisting gatekeeper node
(`/nav2_param_gatekeeper`, see docs/robot-repo-tasks.md) rather than Nav2's own
per-node services — the gatekeeper fronts all three Nav2 nodes behind one
service pair, bounding what an unauthenticated rosbridge client can touch to
a curated 7-parameter whitelist instead of Nav2's full parameter surface.
Wraps every call in a hard 4s timeout (`RESPONSE_TIMEOUT_MS`) since rosbridge
does not itself time out a call to a nonexistent service — without it, a
missing gatekeeper (true today, since Nav2 isn't deployed anywhere yet) would
hang forever instead of surfacing unavailability.

### 6.4 Hooks

| Hook | Topic | Notes |
|---|---|---|
| `useRosConnection` | — | connects on mount, exposes status + `reconnect()` |
| `useRosTopic` | generic | **the base primitive.** Holds latest msg + `lastReceivedAt`; a 1 Hz watchdog marks data stale after `staleMs` (default 4000). `hasData = !!data && !stale` |
| `useOdometry` | `/odom` | speed read verbatim from `twist.twist.linear.x`; heading via quaternion→yaw; integrates distance from pose deltas, **rejecting jumps > 2 m** as localization resets |
| `useGps` | `/fix` | maps `status.status` → `NO_FIX`/`FIX`/`SBAS_FIX`/`GBAS_FIX` |
| `useLaserScan` | `/scan` | converts polar → cartesian, **discards** non-finite ranges and values outside `[range_min, range_max]` rather than substituting |
| `useOccupancyGrid` | `/map` | `staleMs: 15000`, no throttle (maps are latched/rare). Returns raw Int8 array: `-1` unknown, `0` free, `100` occupied |
| `useTF` | `/tf`, `/tf_static` | `ROSLIB.TFClient`, `base_link` relative to `map`, 10 Hz, thresholds 0.01 |
| `useRobotMode` | `/robot_mode` | 3 s startup grace, then falls back to `OUTDOOR` with `isDefault: true` (a UI default, never presented as sensor data) |
| `useCameraFeed` | auto-detect | polls `getTopicList()` every 5 s against a candidate list, subscribes to the first that is actually advertised |
| `useUrdfViewer` | `/robot_description` | mounts `ROS3D.Viewer` + `ROS3D.UrdfClient` + grid, dynamic-imports ros3d/three, sets `window.THREE` for the UMD build |
| `useDataSourceSelection` | — | persisted enabled/disabled set for the Data & Backups source picker (`src/config/dataSources.js`); backfills newly-added source ids from their shipped default rather than dropping unknown stored state |
| `useBackupSettings` / `useSnapshotInterval` | — | persisted rotation interval + retention count (shared by `.mcap` and camera backups) and the separate camera capture interval |

### 6.5 Components

- **`GpsMapView`** (260 lines, the largest) — Leaflet + OSM tiles. Initial view
  `[11.1271, 78.6569]` zoom 6 (**Tamil Nadu, India**), auto-zooms to 19 on first fix.
  Cyan robot marker as an `L.divIcon` with a CSS-rotated heading arrow from `/odom`.
  Draws a breadcrumb polyline capped at **5000 points** (ring buffer). Renders the
  mission route as numbered, draggable waypoint markers (`Map<id, L.Marker>`, with
  explicit `removeLayer` on delete) joined by a dashed line from the robot onward.
  Click-to-add is **armed** via an on-map toggle so stray clicks don't drop pins.
  Publishes its `map` instance as `mapApi` so `MissionPlanner` can drive it.
  ⚠ The map container's `className` must stay static — `L.map()` adds its own
  classes to that node imperatively, and letting React rewrite `className` wipes
  them, silently killing the map's CSS and click handling. Reactive styling on
  that node goes through inline `style`.
- **`SlamView`** — Canvas2D. Renders the OccupancyGrid to an offscreen ImageData at
  native resolution then upscales with `imageSmoothingEnabled = false`. Flips row
  order (`py = height - 1 - floor(i/width)`) because the ROS map origin is bottom-left.
  Transforms the live `/scan` into the robot's map pose and overlays it. Green
  triangle = robot.
- **`LidarView`** — Canvas2D polar plot with 1 m range rings. Implements a
  **safety zone**: a rectangle 1.2 m forward × 0.8 m wide in robot frame. Any scan
  point inside flips the display to `SAFETY ZONE BREACH` (red). Purely a visual
  indicator — it triggers no robot action.
- **`CameraView`** — plain `<img>` pointed at `web_video_server`'s MJPEG stream.
  Note this **bypasses** `useCameraFeed` entirely.
- **`MissionPlanner`** — multi-waypoint route editor. Name + lat/lon entry form
  (`ADD WAYPOINT`, or Enter), then an ordered list with per-row reorder (▲▼),
  remove, and select-to-focus-on-map. Header shows the count and the total
  **straight-line** length (explicitly not a drive distance, and no ETA — the
  dashboard knows no speed). `CLEAR ALL` takes a second confirming press.
  `SEND ROUTE (N)` dispatches the whole route as one `FollowGPSWaypoints` goal;
  waypoints then read `SENT_UNCONFIRMED`, never "reached".
- **`ControlPanel`** — START/PAUSE/RESUME/STOP/RETURN HOME + a two-click-confirm
  EMERGENCY STOP (3 s confirm window).
- **`StatusPanel`** — mode, speed, heading, distance, GPS status/lat/lon, ROS link.
- **`UrdfWidget`**, **`PreviewPanel`**, **`NoDataBadge`**, **`Header`**, **`GpsPreviewMap`**.
- **`DataHandlingPage`** — full-view overlay (same `Dialog`-based structure as
  `ErrorReference`), opened from Settings → DATA. Folder picker, the data-source
  selection list grouped by category (topics + the synthetic `camera-snapshots`
  entry, one picker for both — see `src/config/dataSources.js`), rotation/retention/
  snapshot-interval inputs, start/stop with a live elapsed-time status line, the
  camera-snapshot-unavailable banner, a live capture thumbnail, and a backup list
  with per-file size/timestamp, running totals, and a two-step-confirm delete
  (mirrors `MissionPlanner`'s `CLEAR ALL` pattern).
- **`Nav2ThresholdPanel`** (wrapped by **`Nav2ThresholdPage`**, a `Dialog`-based full-view overlay opened
  from the Sidebar — **not** a dashboard-grid panel; it started as one but was moved out in a later UX
  pass, same reasoning as `GnssQualityPanel` below) — one row per curated Nav2 threshold: label, a
  "LIVE `<value>`"/"NO LIVE VALUE" readout, a bounded numeric input (empty by default, safe default shown
  only as a placeholder — never pre-filled as if it were a live reading), and a per-row APPLY reusing
  `CommandFeedback`'s `SENDING`/`SENT_UNCONFIRMED`/`FAILED` states. Connection-gated like `ControlPanel`;
  shows an inline `NAV2_UNAVAILABLE` banner when connected but the gatekeeper never responds. Out-of-range
  input is rejected client-side with no service call made.
- **`GnssQualityPanel`** (wrapped by **`GnssQualityPage`**) — also moved out of the grid into a Sidebar
  overlay in the same pass, for the same reason: an occasional-use diagnostic doesn't need a
  permanently-visible tile competing with the live views for the one-screen fold. Its internal stat grid
  (SOLUTION/ACCURACY/GEOMETRY/SIGNAL/RF FRONT-END, `sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5`) is tuned
  to the `Dialog` `2xl` size's actual capped width (`max-w-6xl` = 1152px) rather than plain viewport
  breakpoints — a `lg:` (1024px viewport) trigger crushed every column into truncated, overlapping text
  once the panel's real container was narrower than the viewport, since Tailwind breakpoints key off
  viewport width, not the parent's actual rendered width. `Dialog.jsx`'s `SIZES` map gained the `2xl`
  option for this.
- **`Sidebar`** — replaced `SettingsMenu` (deleted). The dashboard's single navigation surface, opened by
  a hamburger icon at the header's top-left (not the old gear icon). `Dialog`-style a11y (focus trap,
  Esc, backdrop-click) but slides in from the left instead of centering. Sections: DASHBOARD LAYOUT (Edit
  layout toggle, Reset — stay open after use, they're in-place toggles), PANELS (GNSS Quality, Nav2
  Threshold Tuning), DATA (Data & Backups), HELP (Error Reference) — the latter three close the sidebar
  before opening their page.

### 6.6 Theme

Tailwind custom palette: `deck` (dark blues `#0a0e14` → `#243043`), `signal`
(`amber #f5a623`, `cyan #3ddcff`, `green #37e29a`, `red #ff4d5e`, `violet #8c7bff`),
`ink` (`high/mid/low` text greys). Monospace-heavy "ground control station" aesthetic.

---

## 7. HOW IT ALL RUNS TOGETHER

```
   ESP32  ──serial /dev/esp 115200──►  esp32_odom  ──►  /odom, /joint_states, TF odom→base_link
     ▲                                     ▲
     └──── CMD,v,w ◄── /cmd_vel ───────────┘

  YDLidar ──serial /dev/ttyUSB0 230400──►  ydlidar_ros2_driver  ──►  /scan
                                                                       │
  u-blox GPS ──►  ublox_gps_node  ──►  /fix  ──►  hybrid_manager       │
                                                       │               ▼
                                                       │        slam_toolbox  ──► /map, TF map→odom
                                                       │
  gogo.xacro ──► robot_state_publisher ──► /robot_description, TF base_link→*
                                                       │
  Depth camera ──► /camera/camera/color/image_raw ──► web_video_server (:8080 MJPEG)
                                                       │
                              ALL TOPICS ──► rosbridge_server (:9090 WebSocket)
                                                       │
                                                       ▼
                                          roslibjs ── amr-dashboard (:5173)
                                                    React + Leaflet + Canvas2D + ros3d
```

### Required processes for a full operator session

```bash
# On the robot
ros2 launch rock_bringup navigation.launch.py          # or indoor_amr_launch.py to map
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
ros2 run web_video_server web_video_server

# On any machine with a browser
npm install && npm run dev                             # in amr-dashboard/
```

**The frontend does NOT require ROS 2 to be installed on the machine running it.**
`roslib` is a pure-JS client speaking rosbridge's JSON-over-WebSocket protocol.
ROS 2 must exist somewhere reachable on the network, exposing ports 9090 and 8080.

---

## 8. KNOWN ISSUES / GAPS

Grouped by severity. All of these are real observations from the source.

### Blocking / functional

1. **`/robot_mode` is never published.** The dashboard's entire INDOOR/OUTDOOR view
   switching depends on it; `hybrid_manager` tracks the equivalent state internally
   but publishes nothing. The dashboard therefore always falls back to `OUTDOOR`.
   *Fix: publish `std_msgs/String` from `hybrid_manager` on every state change.*
2. **`amr_msgs/MissionGoal` does not exist.** No `amr_msgs` package is in the
   workspace, so the legacy `sendGoal` path publishes a message type rosbridge
   cannot resolve. (The Mission Planner no longer uses it; `SEND ROUTE` goes to
   `FollowGPSWaypoints` instead.)
3. **No subscriber for any operator command topic.** `/mission_state_cmd`,
   `/emergency_stop`, `/mission_goal` are published into the void.
4. **Nav2 is not in the workspace at all.** `RobotCommandService` calls
   `/navigate_to_pose` and `/follow_gps_waypoints`, but no `nav2_bringup`,
   costmaps, planner or controller is launched anywhere. The robot can localize
   but cannot autonomously navigate.
5. **The action paths speak the wrong protocol.** roslib 1.4.1's `ActionClient`
   is ROS1 actionlib, so `sendWaypoints`, `returnHome` and `stop`'s goal-cancel
   cannot reach a ROS2 action server regardless of whether Nav2 is running. This
   is independent of gap 4 and must be fixed alongside it — see the caveat
   under §5.2.
6. **Wheel joints are `type="fixed"` in the URDF** while `/joint_states` publishes
   positions for them — wheels can never animate.

### Portability / robustness

6. **Hardcoded absolute paths** throughout `hybrid_manager.py` and
   `rock_bringup/navigation.launch.py`: `/home/ubuntu/ros2_ws`, `/opt/ros/jazzy`,
   `/home/ubuntu/ublox_config.yaml`, `/home/ubuntu/2_maps/maptest3`.
7. **Hardcoded `localhost` in the frontend.** `RosConnectionService` correctly uses
   `VITE_ROSBRIDGE_URL`, but `CameraView.jsx:4` (`http://localhost:8080`) and
   `useUrdfViewer.js:56` (`http://localhost:9090/`) do not — both break the moment
   the browser is not running on the robot itself.
8. **Serial port/baud hardcoded** in `odom_node.py` instead of being ROS parameters.
   Two USB serial devices contend for enumeration order; `/dev/esp` implies a udev
   rule exists for the ESP32, but the lidar still uses raw `/dev/ttyUSB0`.
9. **`package.xml` dependencies are incomplete** — `esp32_odom` omits `sensor_msgs`
   and `python3-serial`; `hybrid_navigation` declares no runtime deps at all;
   `slam_toolbox` is never declared by any package that launches it. `rosdep` cannot
   resolve this workspace.
10. **`rock_bringup/setup.py` has `packages=[]` and does not install `config/`** —
    the YAML is read from the source tree by absolute path.

### Design smells

11. **`subprocess.Popen` + `source setup.bash` for node management** instead of ROS 2
    lifecycle nodes or launch composition. Brittle, and orphans processes if the
    manager is SIGKILLed.
12. **Blocking `time.sleep()` inside a ROS callback** (`start_slam_stack`, ~14 s)
    stalls the executor and blocks `/fix` processing during startup.
13. **Conflicting lidar transforms** — `indoor_amr` static TF puts `laser_frame` at
    z=0.02; the URDF puts `lidar_link_1` at (0.034, 0, 0.1771). Different frame names,
    different mount points, both potentially publishing.
14. **GPS validity test ignores `status.status`** — uses only `lat != 0 && lon != 0`.
15. **Two `TFClient` instances** are created independently (`useTF`, `useUrdfViewer`)
    with different `fixedFrame` values (`map` vs `base_link`) — duplicate TF traffic
    over the WebSocket.
16. **`CameraView` bypasses `useCameraFeed`.** The auto-detection hook exists, is
    well-written, and is unused by the component that should use it.
17. **Three copies of `hybrid_manager`** (`.py`, `_v0.py`, `_backup.py`) in the
    package — version control by filename.
18. **`react-grid-layout` is a declared dependency but never imported.**
19. **No tests beyond the ament boilerplate** (`test_copyright`, `test_flake8`,
    `test_pep257`) in every package.
20. **No CI, no Dockerfile, no `.env.example`** despite the README referencing one.

---

## 9. GLOSSARY OF TERMS USED IN THIS PROJECT

- **AMR** — Autonomous Mobile Robot.
- **ROS 2 Jazzy** — "Jazzy Jalisco", the ROS 2 LTS release targeting Ubuntu 24.04.
- **colcon** — the ROS 2 meta-build tool; `colcon build` produces `build/` and `install/`.
- **ament_python** — the build type for pure-Python ROS 2 packages.
- **rclpy** — the ROS 2 Python client library.
- **TF / tf2** — the transform system tracking coordinate-frame relationships over time.
- **`map` / `odom` / `base_link`** — the REP-105 frame convention. `odom` is smooth
  but drifts; `map` is drift-free but jumps on localization correction.
- **SLAM** — Simultaneous Localization And Mapping.
- **slam_toolbox** — the ROS 2 2D SLAM package; `online_async` = mapping,
  `localization` = pose estimation against a saved map.
- **OccupancyGrid** — 2D map as an Int8 array: `-1` unknown, `0` free, `100` occupied.
- **LaserScan** — polar range array with `angle_min`, `angle_increment`, `ranges[]`.
- **NavSatFix** — GNSS message: latitude, longitude, altitude, covariance, fix status.
- **Odometry** — pose + twist estimate, here derived from wheel encoder ticks.
- **URDF / xacro** — robot description XML; xacro is the macro preprocessor for it.
- **robot_state_publisher** — reads URDF + `/joint_states`, publishes the robot's TF tree.
- **Lifecycle node** — a ROS 2 node with managed states (unconfigured → inactive →
  active); the YDLidar driver is one.
- **rosbridge** — a server exposing the full ROS graph as JSON over WebSocket.
- **roslibjs** — the JavaScript client for rosbridge.
- **web_video_server** — bridges ROS image topics to HTTP MJPEG streams.
- **Nav2** — the ROS 2 navigation stack (planner, controller, behavior tree,
  costmaps). *Referenced by this project's frontend but not currently deployed.*
- **ros2_control** — the hardware abstraction/control framework; a `.ros2control`
  file exists in the URDF directory.

---

## 10. QUICK REFERENCE — WHAT TO ASK ABOUT WHAT

Robot-side paths below (`src/...`) refer to the **robot's own workspace**,
not this repo — see the scope note at the top of this document.

| If the question is about… | Look at |
|---|---|
| Wheel odometry, serial protocol, `/cmd_vel` | `src/esp32_odom/esp32_odom/odom_node.py` |
| Indoor/outdoor switching logic | `src/hybrid_navigation/hybrid_navigation/hybrid_manager.py` |
| Building a new map | `src/indoor_amr/launch/indoor_amr_launch.py` |
| Running against a saved map | `src/rock_bringup/launch/navigation.launch.py` + `config/mapper_localization.yaml` |
| Robot geometry, frames, meshes | `src/gogo_description/urdf/gogo.xacro` |
| LiDAR tuning | `src/ydlidar_ros2_driver/params/ydlidar.yaml` |
| The WebSocket connection | `amr-dashboard/src/services/RosConnectionService.js` |
| Operator commands | `amr-dashboard/src/services/RobotCommandService.js` |
| How a widget gets data | `amr-dashboard/src/hooks/useRosTopic.js` (all others build on it) |
| The topic contract | `amr-dashboard/README.md` |
