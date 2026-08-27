# Hybrid AMR — Operator Dashboard

This repo holds the client-side operator dashboard for a hybrid
indoor/outdoor Autonomous Mobile Robot ("gogo"). It's a browser-based ground
control station that talks to the robot's ROS 2 stack exclusively over
rosbridge WebSocket — no mock data, no REST API, and no robot-side/backend
code lives here.

> For the full interface contract this dashboard expects from the robot
> (topics, message types, TF tree) see [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)
> §5. That document also has historical detail on the companion ROS 2 robot
> workspace this dashboard was built against. That workspace runs on the
> robot itself, in its own separate repo — it is not part of this repo.

## Repository layout

```
ros2_ws/
├── amr-dashboard/            React/Vite operator ground control station (the app)
├── architecture.drawio       system architecture diagram (draw.io)
└── docs/                     UI guide, remediation specs
```

## Prerequisites

- Node.js 18+
- A reachable robot running the ROS 2 stack described in `PROJECT_CONTEXT.md`,
  exposing `rosbridge_server` (WebSocket, default port 9090) and, optionally,
  `web_video_server` (MJPEG, default port 8080) for the camera panel.

To point a dashboard machine at a robot without guessing IPs/ports by hand,
use the two standardized handshake prompts in
[`docs/prompts/`](docs/prompts/): run
[`S.Prompt`](docs/prompts/S.Prompt.md) on the robot to discover its
connection details, then feed that output into
[`C.Prompt`](docs/prompts/C.Prompt.md) on the dashboard machine to configure
and verify the link.

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

The frontend does **not** require ROS 2 to be installed on the machine
running it — `roslib` is a pure-JS client speaking rosbridge's
JSON-over-WebSocket protocol. Point `VITE_ROSBRIDGE_URL` (see
`amr-dashboard/.env.example`) at a robot that's reachable on the network.

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
