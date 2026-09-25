# Hybrid AMR Command Center

A ground control station for a ROS2 Jazzy hybrid (indoor/outdoor) autonomous
mobile robot. Every widget is a live subscriber to a real ROS2 topic over
ROSBridge — **no mock data, no simulated telemetry, no REST polling**.

The guiding rule is **honesty**: the dashboard never shows a value as if it were
live when it isn't, and never implies the robot acted on a command it cannot
confirm. Missing data is reported by _cause_ — `OFFLINE` (no link) vs `NO SIGNAL`
(link fine, topic silent) vs `STALE · 8s` — not as an undifferentiated `NO DATA`.

## Stack

- ReactJS + Vite + TailwindCSS
- ROSLIBJS over ROSBridge WebSocket (`ws://localhost:9090`)
- Leaflet + OpenStreetMap (outdoor GPS view)
- Canvas2D for LiDAR + SLAM rendering (lightweight, no WebGL dependency for those views)
- ROS3DJS (bundles its own Three.js) for the URDF robot widget

## Prerequisites

1. ROS2 Jazzy robot stack running, publishing the topics listed below.
2. `rosbridge_server` running and reachable:
   ```bash
   ros2 launch rosbridge_server rosbridge_websocket_launch.xml
   ```
   Default endpoint: `ws://localhost:9090`. Override via `.env`:
   ```bash
   cp .env.example .env
   # edit VITE_ROSBRIDGE_URL if rosbridge runs elsewhere
   ```
   To discover and set these values without guessing, use the
   [`S.Prompt`](../docs/prompts/S.Prompt.md) / [`C.Prompt`](../docs/prompts/C.Prompt.md)
   handshake in [`../docs/prompts/`](../docs/prompts/) instead of editing `.env` by hand.

## Install & run

```bash
npm install
npm run dev
```

Open the printed local URL. The dashboard connects to ROSBridge automatically
on load; connection state is shown live in the header.

| Script           | What it does                                           |
| ---------------- | ------------------------------------------------------ |
| `npm run dev`    | Vite dev server (default `:5173`)                      |
| `npm run build`  | Production build to `dist/`                            |
| `npm test`       | Vitest suite, headless (`npm run test:watch` to watch) |
| `npm run lint`   | ESLint over `src/`                                     |
| `npm run format` | Prettier write (`format:check` to verify only)         |

> Changes to `vite.config.js` or new dependencies need a **dev-server restart** —
> Vite does not hot-reload either.

## Operator features

| Feature              | Where                 | Notes                                                                                              |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| **Auto-reconnect**   | Automatic (on link loss) | Retries rosbridge on its own — 1s→2→4→8→16→30s with jitter, **bounded at 6 attempts**. The header counts down (`AUTO-RETRY 3/6 · 4s`) and says so when it gives up. |
| **Reconnect**        | Header (on link loss) | Re-establishes rosbridge without reloading the page, and resets a spent auto-retry budget.          |
| **Light/dark theme** | Header sun/moon       | Persists in `localStorage`; first visit follows the OS setting.                                    |
| **Edit layout**      | Sidebar (hamburger icon) → DASHBOARD LAYOUT | Drag/resize every panel; the arrangement persists and `Reset to default` restores the shipped one. |
| **Error reference**  | Sidebar → HELP        | Catalogue of all 13 fault states with the dialog each raises.                                      |
| **Fault dialogs**    | Automatic             | Selecting a view with no data, or a command that failed to send, explains the cause and the fix.   |
| **Data & Backups**   | Sidebar → DATA        | Record selected ROS topics to `.mcap` and capture periodic camera snapshots, entirely client-side — see below. |
| **GNSS Quality**     | Sidebar → PANELS      | Fix-quality diagnostics — DOP, per-satellite C/N0, accuracy radii, RF front-end health. |
| **Nav2 threshold tuning** | Sidebar → PANELS | Tune a curated set of Nav2 costmap/controller thresholds live over rosbridge — see below. |

All four of the above open as full-view overlay pages from the **hamburger icon** at the top-left of the
header — a single sidebar that replaced the old gear-icon dropdown, so GNSS Quality and Nav2 Threshold
Tuning are no longer grid tiles an operator has to scroll below the fold to find.

Full walkthrough and front-end architecture:
[`docs/dashboard-ui-guide.md`](../docs/dashboard-ui-guide.md).

## ROS2 topic contract

| Topic                                                           | Type                                   | Used by                                              |
| --------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `/hiwonder/gps/fix`                                             | `sensor_msgs/NavSatFix`                | GPS map, status panel, GNSS Quality panel            |
| `/hiwonder/gps/nmea`                                            | `std_msgs/String`                      | Raw NMEA stream (MCAP recording / telemetry)         |
| `/hiwonder/imu/data_raw`                                        | `sensor_msgs/Imu`                      | IMU panel (accel / gyro / orientation)               |
| `/hiwonder/imu/mag`                                             | `sensor_msgs/MagneticField`            | IMU panel (magnetometer)                             |
| `/odom`                                                         | `nav_msgs/Odometry`                    | Speed, heading, distance, GPS heading arrow          |
| `/scan`                                                         | `sensor_msgs/LaserScan`                | LiDAR view, safety zone                              |
| `/map`                                                          | `nav_msgs/OccupancyGrid`               | SLAM indoor main view                                |
| `/cmd_vel`                                                      | `geometry_msgs/Twist`                  | Control panel / velocity commands                    |
| `/radio/cmd_vel`                                                | `geometry_msgs/Twist`                  | Radio velocity command                               |
| `/radio/channels`                                               | `sensor_msgs/Joy`                      | Radio RC channels (DS-600)                           |
| `/radio/status`                                                 | `std_msgs/String`                      | Radio link status                                    |
| `/tf`, `/tf_static`                                             | `tf2_msgs/TFMessage`                   | Robot pose (SLAM view + URDF widget)                 |
| `/robot_description`                                            | `std_msgs/String` (URDF XML)           | URDF widget                                          |
| `/joint_states`                                                 | `sensor_msgs/JointState`               | URDF widget                                          |
| `/camera/camera/color/image_raw` (via `web_video_server` MJPEG) | `sensor_msgs/Image`                    | Camera preview                                       |
| `/robot_mode`                                                   | `std_msgs/String` (`INDOOR`/`OUTDOOR`) | Main view selection; defaults to `OUTDOOR` if absent |

> **Camera:** the camera panel does **not** subscribe to the image topic over
> rosbridge. It renders the MJPEG stream served by
> [`web_video_server`](https://wiki.ros.org/web_video_server) at
> `VITE_WEB_VIDEO_URL` (default `http://localhost:8080`) for the hardcoded topic
> `/camera/camera/color/image_raw`. Run `web_video_server` on the robot and set
> `VITE_WEB_VIDEO_URL` if it is not on localhost. If the stream is unreachable
> the panel shows `NO CAMERA STREAM` and retries automatically.

Publishers expected from the operator UI (architecture only — wire to your
robot's actual interfaces in `src/services/RobotCommandService.js`):

| Topic / Action       | Type                                                 | Trigger                        |
| -------------------- | ---------------------------------------------------- | ------------------------------ |
| `/mission_state_cmd` | `std_msgs/String`                                    | START / PAUSE / RESUME / STOP  |
| `/navigate_to_pose`  | `nav2_msgs/action/NavigateToPose`                    | STOP (cancel), RETURN HOME     |
| `/emergency_stop`    | `std_msgs/Bool`                                      | EMERGENCY STOP                 |
| `/cmd_vel`           | `geometry_msgs/Twist`                                | EMERGENCY STOP (zero velocity) |
| `/follow_gps_waypoints` | `nav2_msgs/action/FollowGPSWaypoints`             | Mission Planner "SEND ROUTE"   |
| `/mission_goal`      | `amr_msgs/MissionGoal` (adjust to your goal message) | legacy single-goal path, no longer wired to a button |

> The three action entries above go through roslib's `ActionClient`, which speaks
> **ROS1 actionlib**. A ROS2 action server does not expose those topics, so these
> need switching to rosbridge's `send_action_goal` op when the robot side lands.

## Data & Backups

Sidebar (hamburger icon) → DATA → **Data & backups** opens a page that records selected ROS
topics into `.mcap` files and captures periodic camera snapshots — both
**entirely client-side**, using the browser's File System Access API to write
to a folder on the operator's own machine over the rosbridge connection that
already exists. There is no robot-side recording process and nothing to
deploy on the robot for this feature.

- **Chromium only** (Chrome/Edge) — the File System Access API doesn't exist in
  Firefox or Safari. The page detects this and shows an explanatory message
  instead of a broken folder picker.
- **Message encoding is JSON, not CDR** — rosbridge already delivers topic
  messages to the browser as plain JS objects, so `.mcap` files are written with
  `schemaEncoding: 'jsonschema'` / `messageEncoding: 'json'`. They're valid MCAP
  (readable by the `mcap` CLI and Foxglove Studio) but will not byte-match a
  robot-side `ros2 bag record -s mcap` capture of the same topics.
- **Rotation & retention**: a configurable rotation interval (minutes) closes
  the current `.mcap` file and opens a new one; a configurable retention count
  then deletes the oldest backups beyond that count — shared logic
  (`BackupRotationService.js`) used by both the `.mcap` writer and camera
  snapshots, so the two never drift into separate naming/cleanup behavior.
- **Connection-loss handling**: a dropped rosbridge link pauses recording
  (never corrupts the open file) and writes an explicit gap marker message on
  both the pause and the automatic resume, so a later reader of the file can
  tell data was missed and when.
- **Camera snapshots depend on a robot-side CORS change** that has not
  necessarily landed yet — see [`../docs/server-side-requests.md`](../docs/server-side-requests.md).
  Until it does, the page feature-detects the resulting tainted-canvas
  `SecurityError` on the first capture attempt and shows an explicit
  "camera server does not allow snapshot capture yet" banner rather than
  silently producing zero images while claiming to be capturing.

## Nav2 threshold tuning

Sidebar (hamburger icon) → PANELS → **Nav2 threshold tuning** opens a full-view page (same overlay
pattern as GNSS Quality, Data & Backups, Error Reference) letting an operator tune a curated set of Nav2
costmap/controller thresholds — inflation radius, obstacle range, velocity limits, goal tolerances —
without SSH-ing into the robot or editing YAML. It is **not** a dashboard-grid tile — tuning is an
occasional action, not something that needs a permanently-visible panel competing with the live views.

- **Contract**: generic `rcl_interfaces/srv/GetParameters` / `SetParameters`
  calls over rosbridge, targeted at a single robot-side whitelisting
  **gatekeeper** node (`/nav2_param_gatekeeper`) rather than at Nav2's own
  per-node services directly — that node fronts all three Nav2 nodes
  (`controller_server`, `local_costmap`, `global_costmap`) behind one service
  pair, so an unauthenticated rosbridge client can only touch the 7 curated
  parameters below, not Nav2's entire parameter surface. See
  [`../docs/robot-repo-tasks.md`](../docs/robot-repo-tasks.md) for why that
  design was chosen over calling Nav2 directly, and for the gatekeeper node
  itself (robot-side work, not yet deployed anywhere).
- **Curated parameters** (default / safe range — `src/config/nav2Thresholds.js`):
  `local_costmap.inflation_layer.inflation_radius` (0.55m, 0.05–2.0),
  `local_costmap.obstacle_layer.scan.obstacle_max_range` (2.5m, 0.5–10.0),
  `controller_server.FollowPath.max_vel_x` (0.5 m/s, 0.05–1.5),
  `controller_server.FollowPath.min_vel_x` (0.0 m/s, -0.5–0.0),
  `controller_server.FollowPath.max_vel_theta` (1.0 rad/s, 0.1–3.0),
  `controller_server.general_goal_checker.xy_goal_tolerance` (0.25m, 0.05–1.0),
  `controller_server.general_goal_checker.yaw_goal_tolerance` (0.25 rad, 0.05–1.0).
- **Honesty**: since Nav2 (and the gatekeeper) aren't deployed on any robot
  yet, every row starts empty — the safe default shows only as a greyed-out
  placeholder, never as if it were a live reading — and the panel shows an
  explicit "no Nav2 parameter server responding" banner rather than silently
  displaying defaults as current values. APPLY only ever reports
  `SENT_UNCONFIRMED` on success, never a false "confirmed"; an out-of-range
  value is rejected client-side before any service call is made.
- `src/services/Nav2ParameterService.js` (the rosbridge calls, with a hard
  4-second response timeout since rosbridge itself never times out a call to
  a nonexistent service) and `src/components/Nav2ThresholdPanel.jsx` (the UI)
  implement this.

## Security model

**rosbridge has no authentication, and this dashboard adds none of its own.**
Any client that can reach the rosbridge WebSocket port (default `9090`) can
subscribe to every topic and publish to every command topic, including
`/emergency_stop` and `/cmd_vel` — there is no login, token, or per-client
authorization anywhere in this stack.

This is only acceptable if rosbridge is reachable exclusively on a
physically-controlled, trusted network (e.g. an isolated robot LAN/VLAN that
untrusted devices cannot join). If this dashboard, or the rosbridge port it
talks to, is ever exposed beyond that — a public network, a shared office
Wi-Fi, a cloud relay — that is a hard security blocker and must be closed
with network-level access control (VPN, firewall ACL, etc.) before use, not
worked around in this codebase. See
[`docs/remediation/spec.md`](../docs/remediation/spec.md) REQ-05.

## Project structure

```
src/
  components/      View + panel components (GpsMapView, LidarView, SlamView, CameraView,
                    UrdfWidget, StatusPanel, MissionPlanner, ControlPanel, DataFallback,
                    ErrorBoundary, ErrorDialog, ErrorReference, DataHandlingPage,
                    GnssQualityPanel/Page, Nav2ThresholdPanel/Page, Sidebar, DashboardGrid, ...)
    ui/            Shared primitives: Dialog, SignalChip/SignalDot, FreshnessBadge,
                    PanelHeader, PanelFrame, signalTones (one tone→colour map)
  hooks/           useRosConnection, useRosTopic, useGps, useOdometry, useLaserScan,
                    useOccupancyGrid, useTF, useRobotMode, useUrdfViewer, useTheme,
                    useLayout, useNow, useDataSourceSelection, useBackupSettings
  services/        RosConnectionService (ROSBridge singleton), RobotCommandService (publishers),
                    McapStorageService (folder picker/IndexedDB), McapRecordingService,
                    CameraSnapshotService, BackupRotationService (naming/retention, shared
                    by the previous two), Nav2ParameterService (Nav2 threshold get/set over
                    the robot-side gatekeeper contract)
  config/          dataSources.js (Data & Backups source picker), nav2Thresholds.js (curated
                    Nav2 parameter list + safe ranges)
  errors/          catalog.js — every fault state (code, cause, remedy); one source of
                    truth behind the badges, the dialogs, and the error reference page
  utils/           freshness (LIVE/STALE/NO_DATA classifier), themeColor (canvas theming)
  test/            Vitest setup
  App.jsx          Layout + dynamic main-view swapping logic
```

## Testing

```bash
npm test
```

Vitest + Testing Library, headless (jsdom). Coverage focuses on the
safety-relevant and regression-prone logic rather than chasing a percentage:
`useRosTopic` staleness/unsubscribe, `RobotCommandService.emergencyStop()`
payload + disconnected path, `ControlPanel`'s two-click e-stop state machine,
`useOdometry` jump rejection, `useLayout` persistence/sanitising, the error
catalog's invariants, and `Dialog` accessibility.

## Notes on the "no mock data" constraint

- Every hook in `src/hooks` returns `hasData: false` until a real ROS message has
  been received on the relevant topic; the panel then reports _why_ it has
  nothing (`OFFLINE` / `CONNECTING` / `NO SIGNAL` / `STALE · age`) rather than a
  bare `NO DATA`.
- A value that stopped updating is shown **dimmed with its age**, never as if it
  were still live.
- Speed is read verbatim from `twist.twist.linear.x` on `/odom` — never
  estimated from position deltas.
- GPS path/marker is built only from real `NavSatFix` fixes; nothing is
  interpolated or pre-seeded.
- Camera uses the `web_video_server` MJPEG stream at `VITE_WEB_VIDEO_URL` for a
  fixed topic (see the Camera note above); if that stream is unreachable the
  panel shows `NO CAMERA STREAM` and keeps retrying — it never shows a
  placeholder frame.
- The Mission Planner and Control Panel only define the **publisher/action
  architecture** — they issue real ROS calls but do not simulate robot
  behavior or fabricate acknowledgements.
- The Mission Planner builds an ordered **multi-waypoint route** and dispatches
  it as a single `FollowGPSWaypoints` goal, so the robot sequences the route.
  Waypoints show `SENT_UNCONFIRMED` after dispatch and never advance to
  "reached" — that would need action feedback no server currently sends.
  The route's straight-line length is shown as a sanity check on ordering; it
  is not a drive distance, and no ETA is offered because no speed is known.
