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
| **Edit layout**      | Settings gear         | Drag/resize every panel; the arrangement persists and `Reset to default` restores the shipped one. |
| **Error reference**  | Settings gear → HELP  | Catalogue of all 13 fault states with the dialog each raises.                                      |
| **Fault dialogs**    | Automatic             | Selecting a view with no data, or a command that failed to send, explains the cause and the fix.   |

Full walkthrough and front-end architecture:
[`docs/dashboard-ui-guide.md`](../docs/dashboard-ui-guide.md).

## ROS2 topic contract

| Topic                                                           | Type                                   | Used by                                              |
| --------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `/fix`                                                          | `sensor_msgs/NavSatFix`                | GPS map, status panel                                |
| `/odom`                                                         | `nav_msgs/Odometry`                    | Speed, heading, distance, GPS heading arrow          |
| `/scan`                                                         | `sensor_msgs/LaserScan`                | LiDAR view, safety zone                              |
| `/map`                                                          | `nav_msgs/OccupancyGrid`               | SLAM indoor main view                                |
| `/tf`, `/tf_static`                                             | `tf2_msgs/TFMessage`                   | Robot pose (SLAM view + URDF widget)                 |
| `/robot_description`                                            | `std_msgs/String` (URDF XML)           | URDF widget                                          |
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
                    ErrorBoundary, ErrorDialog, ErrorReference, DashboardGrid, ...)
    ui/            Shared primitives: Dialog, SignalChip/SignalDot, FreshnessBadge,
                    PanelHeader, PanelFrame, signalTones (one tone→colour map)
  hooks/           useRosConnection, useRosTopic, useGps, useOdometry, useLaserScan,
                    useOccupancyGrid, useTF, useRobotMode, useUrdfViewer, useTheme,
                    useLayout, useNow
  services/        RosConnectionService (ROSBridge singleton), RobotCommandService (publishers)
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
