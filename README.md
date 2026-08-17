# Hybrid AMR — ROS 2 Workspace

A hybrid indoor/outdoor Autonomous Mobile Robot ("gogo") built on **ROS 2
Jazzy**. A differential-drive base uses an ESP32 microcontroller for wheel
odometry/motor control, a YDLidar 2D scanner for mapping and localization, a
u-blox GPS for outdoor positioning, and a depth camera for video. A
supervisor node watches GPS validity and switches the robot between
**GPS mode** (outdoor) and **SLAM mode** (indoor). Operators drive and
monitor the robot from a browser-based ground control station that talks to
ROS 2 exclusively over rosbridge WebSocket — no mock data, no REST API.

> For full architectural detail — every package, topic, launch file, and
> known issue, derived directly from the source tree — see
> [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

## Repository layout

```
ros2_ws/
├── src/                      colcon workspace
│   ├── esp32_odom/           serial odometry bridge (ESP32 ↔ ROS 2)
│   ├── gogo_description/     URDF, meshes, RViz configs
│   ├── hybrid_navigation/    hybrid_manager — GPS/SLAM mode supervisor
│   ├── indoor_amr/           SLAM mapping-mode launch
│   ├── rock_bringup/         production bringup + localization against a saved map
│   ├── ydlidar_ros2_driver/  vendored (submodule) — LiDAR ROS 2 driver
│   ├── YDLidar-SDK/          vendored (submodule) — LiDAR C++ SDK
│   └── mapviz/               vendored (submodule) — Qt map visualization
├── amr-dashboard/            React/Vite operator ground control station
├── docs/                     UI guide, remediation specs, architecture diagram
├── build/ install/ log/      colcon artifacts (gitignored, Linux-only, not portable)
└── frames_*.gv / *.pdf       captured `tf2_tools view_frames` snapshots
```

`src/YDLidar-SDK`, `src/mapviz`, and `src/ydlidar_ros2_driver` are git
submodules — run `git submodule update --init --recursive` after cloning.

## Prerequisites

- Ubuntu 24.04 (Noble) with **ROS 2 Jazzy Jalisco**
- `colcon` build tools
- Node.js 18+ (for the dashboard)
- Hardware: ESP32 odometry bridge (`/dev/esp`, 115200 baud), YDLidar
  (`/dev/ttyUSB0`, 230400 baud), u-blox GPS, depth camera

## Build

```bash
source /opt/ros/jazzy/setup.bash
git submodule update --init --recursive
colcon build
source install/setup.bash
```

`build/`, `install/`, and `log/` are gitignored and contain absolute paths
baked in at build time — never copy them between machines; always rebuild.

## Running the robot stack

Launch files differ by scenario:

| Package | Launch file | Purpose |
| --- | --- | --- |
| `gogo_description` | `robot_state_publisher.launch.py` | URDF + `robot_state_publisher` only |
| `gogo_description` | `display.launch.py` | Same, plus RViz2 |
| `indoor_amr` | `indoor_amr_launch.py` | Build a new SLAM map (`slam_toolbox` mapping mode) |
| `rock_bringup` | `navigation.launch.py` | Localize against an existing saved map |

```bash
ros2 launch indoor_amr indoor_amr_launch.py
# or, once a map exists:
ros2 launch rock_bringup navigation.launch.py
```

`hybrid_navigation`'s `hybrid_manager` node supervises which stack is
running based on GPS fix validity; see `PROJECT_CONTEXT.md` §4.3 for its
state machine and current limitations.

To connect the dashboard, also run:

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
# optional, for the camera panel:
ros2 run web_video_server web_video_server
```

## Operator dashboard

The ground control station lives in [`amr-dashboard/`](amr-dashboard/README.md)
(React + Vite + Tailwind, ROSLIBJS over rosbridge). See its README for
install/run instructions, the full ROS topic contract, and the
[UI guide](docs/dashboard-ui-guide.md) for a feature walkthrough.

```bash
cd amr-dashboard
npm install
npm run dev
```

## Security

**rosbridge has no authentication**, and the dashboard adds none of its own.
Any device that can reach the rosbridge port (default `9090`) can subscribe
to every topic and publish to every command topic, including
`/emergency_stop` and `/cmd_vel`. Only run this stack on a physically
isolated, trusted robot network — never expose it to a public network,
shared Wi-Fi, or a cloud relay. See
[`docs/remediation/spec.md`](docs/remediation/spec.md) REQ-05.

## Known gaps

The following are tracked in more detail in `PROJECT_CONTEXT.md`, but worth
surfacing up front:

- `/robot_mode` (used by the dashboard to pick GPS vs. SLAM view) is not yet
  published by any robot-side node.
- The dashboard's mission/e-stop action topics (`/navigate_to_pose`,
  `/follow_gps_waypoints`, legacy `/mission_goal`) go through roslib's
  ROS1-style `ActionClient`, which does not speak the ROS 2 action protocol
  a real Nav2 action server exposes — wiring these up needs rosbridge's
  `send_action_goal` op instead.
- Two inconsistent LiDAR mounting definitions exist (URDF vs. the static TF
  published by `indoor_amr`) — see `PROJECT_CONTEXT.md` §4.4.
