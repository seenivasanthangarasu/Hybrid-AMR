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
- ROS3DJS + Three.js for the URDF robot widget

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

| Topic | Type | Used by |
|---|---|---|
| `/fix` | `sensor_msgs/NavSatFix` | GPS map, status panel |
| `/odom` | `nav_msgs/Odometry` | Speed, heading, distance, GPS heading arrow |
| `/scan` | `sensor_msgs/LaserScan` | LiDAR view, safety zone |
| `/map` | `nav_msgs/OccupancyGrid` | SLAM indoor main view |
| `/tf`, `/tf_static` | `tf2_msgs/TFMessage` | Robot pose (SLAM view + URDF widget) |
| `/robot_description` | `std_msgs/String` (URDF XML) | URDF widget |
| `/camera/image_raw`, `/depth_camera/image_raw`, `/color/image_raw` (`/compressed` preferred) | `sensor_msgs/Image` / `CompressedImage` | Camera preview, auto-detected |
| `/robot_mode` | `std_msgs/String` (`INDOOR`/`OUTDOOR`) | Main view selection; defaults to `OUTDOOR` if absent |

Publishers expected from the operator UI (architecture only — wire to your
robot's actual interfaces in `src/services/RobotCommandService.js`):

| Topic / Action | Type | Trigger |
|---|---|---|
| `/mission_state_cmd` | `std_msgs/String` | START / PAUSE / RESUME / STOP |
| `/navigate_to_pose` | `nav2_msgs/action/NavigateToPose` | STOP (cancel), RETURN HOME |
| `/emergency_stop` | `std_msgs/Bool` | EMERGENCY STOP |
| `/cmd_vel` | `geometry_msgs/Twist` | EMERGENCY STOP (zero velocity) |
| `/mission_goal` | `amr_msgs/MissionGoal` (adjust to your goal message) | Mission Planner "SEND GOAL" |

## Project structure

```
src/
  components/      Presentational + view components (GpsMapView, LidarView, SlamView,
                    CameraView, UrdfWidget, StatusPanel, MissionPlanner, ControlPanel, ...)
  hooks/            useRosConnection, useRosTopic, useGps, useOdometry, useLaserScan,
                    useOccupancyGrid, useTF, useRobotMode, useCameraFeed, useUrdfViewer
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
- Camera topic is auto-detected by querying ROSBridge's live topic list, not
  assumed — if none of the candidate topics are advertised, the camera panel
  shows `NO DATA`.
- The Mission Planner and Control Panel only define the **publisher/action
  architecture** — they issue real ROS calls but do not simulate robot
  behavior or fabricate acknowledgements.

## Enhanced Features

This dashboard now includes advanced industrial-grade features:

### Advanced Mission Planning
- Unlimited waypoints with drag-and-drop functionality
- Waypoint editing (rename, delete, duplicate)
- Import/export JSON capabilities
- Route optimization
- ETA and distance calculations
- Mission progress tracking

### Comprehensive Navigation System Integration
- Automatic detection of Nav2 features (planner, controller, behavior tree, recovery)
- Real-time navigation status monitoring
- Goal feedback and progress tracking
- Manual override controls

### Enhanced Data Visualization
- Detailed GPS information panel with satellite count, HDOP, RTK status
- Advanced LiDAR visualization with obstacle highlighting
- Camera preview with recording capabilities
- Robot diagnostics with pose and joint states
- Topic monitor for real-time ROS topic analysis

### Industrial Professional UI
- Dark slate background (#16232E) with professional color scheme
- Rounded corners with soft shadows
- Glass effects for panels
- Smooth animations
- Responsive design for 4K support
- Consistent font usage (Oswald, Inter, JetBrains Mono)

### System Monitoring
- Comprehensive diagnostics panel
- Real-time system log viewer
- Topic monitor with frequency and subscriber analysis
- ROS node status monitoring

All components consume live ROS data. If a topic is not available, the widget shows "NO DATA" instead of fake values.