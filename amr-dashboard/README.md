# Hybrid AMR Command Center

A production-ready ground control station for a ROS2 Jazzy hybrid (indoor/outdoor)
autonomous mobile robot. Every widget is a live subscriber to a real ROS2 topic
over ROSBridge — **no mock data, no simulated telemetry, no REST polling**.
If a topic has no live publisher, the corresponding widget renders `NO DATA`.

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
| `/mission_goal`      | `amr_msgs/MissionGoal` (adjust to your goal message) | Mission Planner "SEND GOAL"    |

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
  components/      Presentational + view components (GpsMapView, LidarView, SlamView,
                    CameraView, UrdfWidget, StatusPanel, MissionPlanner, ControlPanel, ...)
  hooks/            useRosConnection, useRosTopic, useGps, useOdometry, useLaserScan,
                    useOccupancyGrid, useTF, useRobotMode, useUrdfViewer
  services/         RosConnectionService (ROSBridge singleton), RobotCommandService (publishers)
  App.jsx           Layout + dynamic main-view swapping logic
```

## Notes on the "no mock data" constraint

- Every hook in `src/hooks` returns `hasData: false` (and components render
  `NO DATA`) until a real ROS message has been received on the relevant topic.
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
