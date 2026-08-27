# Hybrid AMR — Operator Dashboard

> **Browser-based ground control station for a ROS 2 Jazzy hybrid indoor/outdoor Autonomous Mobile Robot.**
> Talks to the robot exclusively over rosbridge WebSocket — no mock data, no REST API, no robot-side code in this repo.

---

## Table of Contents

- [What This Is](#what-this-is)
- [Repository Layout](#repository-layout)
- [Active ROS Topics](#active-ros-topics)
- [Dashboard Panels](#dashboard-panels)
- [Prerequisites](#prerequisites)
- [Quick Start — Windows](#quick-start--windows)
- [Quick Start — Linux / Ubuntu](#quick-start--linux--ubuntu)
- [Environment Configuration (.env)](#environment-configuration-env)
- [Connection Handshake](#connection-handshake-robot--dashboard)
- [Running the Dev Server](#running-the-dev-server)
- [Building for Production](#building-for-production)
- [Security Warning](#security-warning)
- [Troubleshooting](#troubleshooting)
- [Known Gaps](#known-gaps)

---

## What This Is

The **Hybrid AMR Command Center** is a React + Vite single-page application that connects to a running ROS 2 robot over [rosbridge_server](https://github.com/RobotWebTools/rosbridge_suite) and displays live telemetry across a draggable, resizable dashboard grid.

**Requires:**
- Robot running ROS 2 Jazzy with `rosbridge_websocket` on port **9090**
- Optionally `web_video_server` on port **8080** for the MJPEG camera stream
- Node.js 18+ on the operator machine (no ROS 2 needed on the operator machine)

---

## Repository Layout

```
Hybrid-AMR/
├── amr-dashboard/          React/Vite operator ground control station
│   ├── src/
│   │   ├── components/     UI panels (StatusPanel, ImuPanel, GpsMapView, …)
│   │   ├── hooks/          ROS topic hooks (useGps, useImu, useOdometry, …)
│   │   ├── services/       RosConnectionService, McapRecordingService, …
│   │   ├── config/         dataSources.js — MCAP recording topic registry
│   │   └── utils/          gnss.js, freshness.js, …
│   ├── .env.example        Template for environment variables
│   ├── package.json
│   └── vite.config.js
├── architecture.drawio     System architecture diagram (open with draw.io)
├── docs/
│   ├── dashboard-ui-guide.md
│   ├── prompts/            S.Prompt (robot) + C.Prompt (dashboard) handshake
│   └── remediation/        Spec documents
└── PROJECT_CONTEXT.md      Full ROS topic contract and architecture notes
```

---

## Active ROS Topics

| Topic | Message Type | Panel |
|---|---|---|
| `/hiwonder/gps/fix` | `sensor_msgs/NavSatFix` | Status, GPS Map |
| `/hiwonder/imu/data_raw` | `sensor_msgs/Imu` | IMU Panel |
| `/hiwonder/imu/mag` | `sensor_msgs/MagneticField` | IMU Panel |
| `/odom` | `nav_msgs/Odometry` | Status |
| `/scan` | `sensor_msgs/LaserScan` | LiDAR Preview |
| `/map` | `nav_msgs/OccupancyGrid` | SLAM View |
| `/cmd_vel` | `geometry_msgs/Twist` | Control Panel |
| `/tf` | `tf2_msgs/TFMessage` | URDF Widget |
| `/tf_static` | `tf2_msgs/TFMessage` | URDF Widget |
| `/robot_description` | `std_msgs/String` | URDF Widget |
| `/joint_states` | `sensor_msgs/JointState` | URDF Widget |
| `/camera/camera/color/image_raw` | `sensor_msgs/Image` | Camera (MJPEG) |

---

## Dashboard Panels

| Panel | Description |
|---|---|
| **Main View** | Switchable: GPS Map / SLAM / LiDAR / Camera |
| **Status** | Speed, heading, GPS fix, lat/lon, HDOP, satellites |
| **IMU** | Roll/pitch/yaw, accel XYZ, gyro XYZ, magnetometer XYZ |
| **Mission Planner** | GPS waypoint mission control |
| **Control Panel** | Velocity joystick / keyboard teleop |
| **GPS Preview** | Thumbnail GPS map |
| **LiDAR Preview** | Thumbnail LaserScan polar plot |
| **Camera Preview** | Live MJPEG thumbnail |
| **URDF Widget** | 3D robot model (requires mesh server) |
| **GNSS Quality** | Full DOP / satellite / RTK quality page (sidebar) |
| **Nav2 Tuning** | Nav2 cost/inflation threshold sliders (sidebar) |
| **Data & Backups** | MCAP recording + camera snapshot capture (sidebar) |

All panels show **LIVE / STALE / NO DATA** freshness badges — no synthetic zeros are ever displayed.

---

## Prerequisites

### Operator machine (Windows or Linux)

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | **18** | `node --version` |
| npm | **9** (bundled with Node) | `npm --version` |
| Git | any | `git --version` |

### Robot (Ubuntu 24.04 / ROS 2 Jazzy)

```bash
# rosbridge must be running:
ros2 launch rosbridge_server rosbridge_websocket_launch.xml

# web_video_server (optional — for camera panel):
ros2 run web_video_server web_video_server
```

---

## Quick Start — Windows

Open **Command Prompt** or **PowerShell**.

### Step 1 — Install Node.js

Download the LTS installer from **https://nodejs.org** and run it. After install:

```powershell
node --version   # v20.x.x or higher
npm --version
```

### Step 2 — Clone the repository

```powershell
git clone https://github.com/seenivasanthangarasu/Hybrid-AMR.git
cd "Hybrid-AMR"
```

### Step 3 — Install dependencies

```powershell
cd amr-dashboard
npm install
```

### Step 4 — Configure the robot connection

```powershell
copy .env.example .env
notepad .env
```

Edit `.env`:

```env
VITE_ROSBRIDGE_URL=ws://192.168.x.x:9090
VITE_WEB_VIDEO_URL=http://192.168.x.x:8080
# VITE_MESH_SERVER_URL=   <- leave commented if no mesh server
```

Replace `192.168.x.x` with your robot's IP address.
Find it on the robot by running: `hostname -I`

### Step 5 — Start the dashboard

```powershell
npm run dev
```

Open your browser at **http://localhost:5173**

> If port 5173 is already in use, Vite will automatically try 5174, 5175, etc.
> The actual URL is printed in the terminal.

---

## Quick Start — Linux / Ubuntu

### Step 1 — Install Node.js

**Option A — NodeSource (recommended, system-wide):**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v20.x.x
```

**Option B — nvm (no sudo, per-user):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version
```

### Step 2 — Clone the repository

```bash
git clone https://github.com/seenivasanthangarasu/Hybrid-AMR.git
cd Hybrid-AMR
```

### Step 3 — Install dependencies

```bash
cd amr-dashboard
npm install
```

### Step 4 — Configure the robot connection

```bash
cp .env.example .env
nano .env          # or: gedit .env   or: code .env
```

Edit `.env`:

```env
VITE_ROSBRIDGE_URL=ws://192.168.x.x:9090
VITE_WEB_VIDEO_URL=http://192.168.x.x:8080
# VITE_MESH_SERVER_URL=
```

Find the robot's IP on the robot machine:

```bash
hostname -I | awk '{print $1}'
```

### Step 5 — Start the dashboard

```bash
npm run dev
```

Open your browser at **http://localhost:5173**

To expose the dashboard on your local network (e.g. from a tablet):

```bash
npm run dev -- --host
```

---

## Environment Configuration (.env)

| Variable | Required | Example | Description |
|---|---|---|---|
| `VITE_ROSBRIDGE_URL` | **Yes** | `ws://192.168.1.100:9090` | WebSocket URL of rosbridge_server |
| `VITE_WEB_VIDEO_URL` | No | `http://192.168.1.100:8080` | HTTP URL of web_video_server for MJPEG camera |
| `VITE_MESH_SERVER_URL` | No | `http://192.168.1.100:8000/` | Static file server for URDF mesh files (.stl/.dae) |
| `VITE_UBLOX_NS` | No | `/ublox` | ROS namespace prefix for u-blox GNSS quality topics |

> `.env` is in `.gitignore` and is never committed — your robot's IP stays local.

> **Vite does not hot-reload `.env` changes.** Stop the server (`Ctrl+C`) and restart after editing.

---

## Connection Handshake (Robot → Dashboard)

Use the handshake prompts in `docs/prompts/` to set up the connection without guessing:

1. **On the robot** — run `S.Prompt.md` to print a `connection` block with the IP, ports, and active topics.
2. **On the operator machine** — paste that output into `C.Prompt.md` to automatically write `.env`, verify reachability, start the dev server, and confirm the link.

---

## Running the Dev Server

```bash
# Standard — localhost only
npm run dev

# Exposed on all network interfaces (tablet / phone on same LAN)
npm run dev -- --host

# Custom port
npm run dev -- --port 3000
```

---

## Building for Production

Set `.env` values first (they are baked into the bundle at build time):

```bash
# Linux/Mac
VITE_ROSBRIDGE_URL=ws://192.168.1.100:9090 npm run build

# Windows (PowerShell)
$env:VITE_ROSBRIDGE_URL="ws://192.168.1.100:9090"; npm run build
```

Or just edit `.env` and then:

```bash
npm run build
```

Output goes to `amr-dashboard/dist/`. Serve it with any static file server:

```bash
# Quick test
npx serve dist

# Copy to nginx web root
sudo cp -r dist/* /var/www/html/
```

---

## Security Warning

> **rosbridge has no authentication.** Any device that can reach port 9090 can read every topic and publish velocity commands to drive the robot.

- Run only on a physically isolated, trusted robot LAN or a direct point-to-point Wi-Fi link
- Never expose rosbridge to a public network, shared Wi-Fi, or cloud relay
- Use a VPN (WireGuard / OpenVPN) if remote access is needed

---

## Troubleshooting

### Dashboard shows `OFFLINE` / `RETRYING`

```bash
# On the robot — check rosbridge is running
ros2 node list | grep rosbridge

# On the operator machine — ping the robot
ping 192.168.x.x

# TCP-check port 9090
# Linux:
nc -zv 192.168.x.x 9090
# Windows (PowerShell):
Test-NetConnection 192.168.x.x -Port 9090

# On the robot — open the firewall port
sudo ufw allow 9090/tcp
sudo ufw allow 8080/tcp
```

Make sure `.env` was saved and the dev server was **restarted** after editing.

---

### GPS shows `NO DATA`

```bash
# On the robot — verify the topic exists and publishes
ros2 topic echo /hiwonder/gps/fix --once
ros2 topic hz /hiwonder/gps/fix
```

If silent, check that the GPS driver (Hiwonder) is running on the robot.

---

### IMU shows `NO DATA`

```bash
ros2 topic echo /hiwonder/imu/data_raw --once
ros2 topic echo /hiwonder/imu/mag --once
```

---

### Camera panel is blank

1. Check `VITE_WEB_VIDEO_URL` in `.env`
2. Test the stream directly in a browser:
   `http://192.168.x.x:8080/stream?topic=/camera/camera/color/image_raw`
3. Check web_video_server is running: `ros2 node list | grep web_video`

---

### `npm install` fails / `EACCES` errors

```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

### Port already in use

```bash
# Linux — free port 5173
lsof -ti :5173 | xargs kill -9

# Windows (PowerShell)
netstat -ano | findstr :5173
# then:
taskkill /PID <PID> /F
```

---

## Known Gaps

- `/robot_mode` (used to auto-switch GPS vs. SLAM main view) is not yet published by any robot-side node — the dashboard defaults to GPS/OUTDOOR mode.
- Mission/e-stop action topics use roslib's ROS1-style `ActionClient`; proper ROS 2 action protocol support requires rosbridge's `send_action_goal` op.
- The URDF widget requires a separate static HTTP server for mesh files — set `VITE_MESH_SERVER_URL` or leave it unset to render without robot geometry.
- Two inconsistent LiDAR mounting definitions exist (URDF vs. static TF from `indoor_amr`) — see `PROJECT_CONTEXT.md` §4.4.

---

## License

MIT — open for educational and research use.
