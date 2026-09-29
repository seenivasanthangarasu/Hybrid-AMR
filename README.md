# Hybrid AMR

Autonomous Mobile Robot (AMR) software platform running on **ROS 2 Jazzy Jalisco**, utilizing a multi-stage **Docker container architecture** engineered for deterministic deployment on embedded ARM64 compute platforms.

* **Current Development & Validation Platform**: Thundercomm Rubik Pi 3 (Qualcomm QCS6490 Octa-Core ARM64, Ubuntu 24.04 LTS)
* **Primary Future Migration Target**: NVIDIA Jetson Orin Nano (ARM Cortex-A78AE, Ubuntu 24.04 LTS)
* **Target Middleware**: ROS 2 Jazzy Jalisco via FastDDS UDPv4 loopback transport
* **Containerization Status**: **READY & EMPIRICALLY VERIFIED** on Rubik Pi 3 hardware

---

## 1. Quick Start

### 1. Clone the Repository
```bash
git clone git@github.com:seenivasanthangarasu/Hybrid-AMR.git
cd Hybrid-AMR
git checkout docker
```

### 2. Verify Host Prerequisites
The host operating system requires:
* Linux Kernel 6.8+ (ARM64 `aarch64`)
* Docker Engine (v24.0+ or v29.1+) with Docker Compose v2
* The unified AMR udev rules active on the host

Install host udev rules if not already present:
```bash
sudo cp udev_rules/99-amr.rules /etc/udev/rules.d/99-amr.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### 3. Verify Hardware Symlinks on Host
Confirm that the host hardware abstraction layer is active:
```bash
ls -l /dev/amr_*
ls -l /dev/gpiochip4
```
Expected output:
* `/dev/amr_sabertooth` $\rightarrow$ `ttyACM0` (Sabertooth 2x32 Motor Controller)
* `/dev/amr_encoder` $\rightarrow$ `ttyACM1` (ESP32-S3 Wheel Encoders)
* `/dev/amr_lidar` $\rightarrow$ `ttyUSB2` (YDLIDAR G4 Laser Scanner)
* `/dev/amr_imu` $\rightarrow$ `ttyUSB1` (Hiwonder 9-DOF IMU)
* `/dev/amr_gps` $\rightarrow$ `ttyUSB0` (Hiwonder GNSS GPS Receiver)
* `/dev/amr_camera` $\rightarrow$ `video0` (V4L2 Video Device)
* `/dev/gpiochip4` (Qualcomm TLMM GPIO character device)

### 4. Build the Docker Image
```bash
docker compose build
# OR:
sudo docker build -t hybrid-amr:latest -f docker/Dockerfile .
```

### 5. Start in Safe Sensors-Only Mode (Motors Inactive)
Recommended for initial bringup and sensor inspection without wheel motion:
```bash
./docker/scripts/run_container.sh --sensors-only
```

### 6. Verify ROS 2 Topics (from Host or Container)
With the container running in host networking mode, you can inspect topics directly:
```bash
ros2 topic list
ros2 topic hz /scan                  # Verified rate: ~11.7 Hz
ros2 topic hz /odom                  # Verified rate: ~50.0 Hz
ros2 topic hz /hiwonder/imu/data_raw # Verified rate: ~30.0 Hz
ros2 topic hz /hiwonder/gps/nmea     # Verified rate: ~10.0 Hz
ros2 topic echo /tf --once
ros2 topic echo /tf_static --once
```

### 7. Start Full Mode (Motors & Radio Teleop Enabled)
Only run full mode with the robot secured:
```bash
./docker/scripts/run_container.sh --full
# OR:
docker compose up -d
```

### 8. Graceful Shutdown
```bash
./docker/scripts/stop_container.sh
# OR:
docker compose down
```

---

## 2. System Architecture & Information Flow

```
                      HYBRID AMR APPLICATION
                                │
                      Docker / ROS 2 Jazzy
                                │
               ┌────────────────┴────────────────┐
               │                                 │
         amr-ros-core                      amr-rosbridge
         (Container)                       (Container)
               │                                 │
     ┌─────────┴─────────┐              ws://localhost:9090
     │                   │                       │
ROS 2 Drivers      Navigation/SLAM        Web Dashboard
(Lidar, Odom,      & Kinematic TF         (Vite React UI :3000
 GPS, IMU, Motor,                          Flask API :5001)
 Radio Teleop)
     │
     ↓ (Explicit Device Passthrough)
Host Hardware Abstraction Layer
     │
┌────┴──────────────────────────┬────────────────────────┐
│                               │                        │
/dev/amr_* Serial/V4L2 Devices  /dev/gpiochip4           Network / Host
│                               │                        │
├─ /dev/amr_sabertooth          └─ HOT RC DS-600         └─ FastDDS UDPv4
├─ /dev/amr_encoder                (GPIO 8 & GPIO 24)       Host Loopback
├─ /dev/amr_lidar
├─ /dev/amr_imu
├─ /dev/amr_gps
└─ /dev/amr_camera
```

### Data Flow in Plain Language:
1. **Sensors $\rightarrow$ Container**: Physical USB and serial sensors enumerate on the Linux host and are mapped to stable `/dev/amr_*` paths by udev. Docker passes these devices explicitly to `amr_ros_core`.
2. **Kinematics & SLAM**: The containerized `esp32_odom` node publishes continuous `/odom` and broadcasts `odom -> base_link` transforms at 50 Hz. `ydlidar_ros2_driver` publishes `/scan` at 11.7 Hz. `slam_toolbox` generates the live occupancy grid `/map`.
3. **Teleop & Motor Control**: Remote pulse widths on GPIO 8 and 24 are sampled via Linux character-device events (`/dev/gpiochip4`) by `radio_receiver_node`, filtered with a low-pass EMA filter, and published to `/cmd_vel`. `sabertooth_node` converts `/cmd_vel` into differential drive serial packets to the Sabertooth 2x32 motor controller.
4. **Telemetry $\rightarrow$ Dashboard**: `amr_rosbridge` bridges all ROS topics over WebSockets on port `9090` to the host React dashboard.

---

## 3. Hardware Abstraction Layer (`/dev/amr_*`)

Physical USB port numbers (`/dev/ttyUSB0`, `/dev/ttyACM1`) are non-deterministic and can shuffle across reboots or hub renegotiations. The host udev layer (`/etc/udev/rules.d/99-amr.rules`) creates stable, deterministic names based on hardware serial numbers and physical hub topologies:

| Hardware Subsystem | Physical Identifier | Stable Device Name | Assigned ROS 2 Node |
| :--- | :--- | :--- | :--- |
| **Sabertooth 2x32 Motor Driver** | `268b:0201`, Serial: `160091F3C484` | `/dev/amr_sabertooth` | `sabertooth_node` |
| **ESP32-S3 Wheel Encoders** | `1a86:55d3` (CH343), Serial: `5B8F128275` | `/dev/amr_encoder` | `odom_node` |
| **YDLIDAR G4 Laser Scanner** | `10c4:ea60` (CP2102), Hub Port `1-2.1.3` | `/dev/amr_lidar` | `ydlidar_ros2_driver_node` |
| **Hiwonder 9-DOF IMU** | `1a86:7523` (CH340), Hub Port `1-2.3` | `/dev/amr_imu` | `hiwonder_imu_node` |
| **Hiwonder GNSS GPS Receiver** | `1a86:7523` (CH340), Hub Port `1-2.2` | `/dev/amr_gps` | `gps_node` |
| **USB Video Camera** | `0c45:6366` USB Video Class | `/dev/amr_camera` | `v4l2_camera_node` |
| **HOT RC DS-600 Radio Receiver** | Qualcomm TLMM GPIO 8 & 24 | `/dev/gpiochip4` | `radio_receiver_node` |

**Why this enables Jetson migration**:
Because the ROS 2 application inside Docker references only `/dev/amr_*` and never raw kernel USB names, migrating to the NVIDIA Jetson Orin Nano requires zero code changes to the ROS application—only the single host udev rules file needs to be present on the Jetson.

---

## 4. Container Services

The application is orchestrated via `docker/docker-compose.yml` across two modular services:

### 1. `amr-ros` (`amr_ros_core`)
* **Role**: Core AMR robotic execution container.
* **Nodes Included**: `rock_bringup` (`navigation.launch.py`), `gogo_description` (URDF / `robot_state_publisher`), `esp32_odom`, `hiwonder_gps`, `hiwonder_imu`, `ydlidar_ros2_driver`, `sabertooth_driver`, `radio_receiver`, and `slam_toolbox`.
* **Execution**: Runs as non-root user `ubuntu` (UID 1000) with supplementary groups `dialout` and `video`.
* **Restart Policy**: `unless-stopped`.

### 2. `amr-rosbridge` (`amr_rosbridge`)
* **Role**: ROSBridge WebSocket gateway.
* **Port**: `9090 / TCP` (Host network namespace).
* **Command**: `ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090`.
* **Purpose**: Serves bidirectional JSON WebSocket streams to the web administration dashboard.

---

## 5. Security & Device Passthrough (Zero Privileged Mode)

This architecture strictly avoids `privileged: true` and never mounts `/dev` or `/` as a whole. Devices are passed explicitly:

```yaml
devices:
  - /dev/amr_sabertooth:/dev/amr_sabertooth
  - /dev/amr_encoder:/dev/amr_encoder
  - /dev/amr_lidar:/dev/amr_lidar
  - /dev/amr_imu:/dev/amr_imu
  - /dev/amr_gps:/dev/amr_gps
  - /dev/amr_camera:/dev/amr_camera
  - /dev/gpiochip4:/dev/gpiochip4
```

Device access is granted using standard Linux group permissions (`dialout` for serial devices, `video` for cameras). The container cannot compromise host root filesystem security.

---

## 6. Radio & Motor Safety Architecture

The control architecture is strictly preserved:
```
HOT RC DS-600 Transmitter
        │ (2.4 GHz RF)
        ↓
FS-iA10B / DS-600 Receiver
        │ (Pulse-width on GPIO 8 & 24)
        ↓
radio_receiver_node (libgpiod character device)
        │ (/cmd_vel Twist)
        ↓
sabertooth_node (watchdog timeout = 0.25s)
        │ (Packetized serial commands)
        ↓
Sabertooth 2x32 Motor Driver
        │
      Motors
```

### Safety Interlocks in Docker Scripts:
To prevent dangerous race conditions or runaway hardware, `./docker/scripts/run_container.sh` executes pre-flight checks:
* Inspects host processes via `pgrep` for any existing native `sabertooth_node` or `navigation.launch.py`.
* Automatically terminates any native motor processes before starting container motor control, ensuring that **two motor-control instances can never access the Sabertooth simultaneously**.
* The containerized `sabertooth_node` maintains an active 250 ms hardware watchdog. If `/cmd_vel` messages cease or the radio signal drops out, the driver halts motors immediately.

---

## 7. Sensors & Verified Publication Rates

The following empirical rates have been validated from live execution inside Docker on the Rubik Pi 3:

| Topic Name | Type | Verified Rate | Description |
| :--- | :--- | :--- | :--- |
| `/scan` | `sensor_msgs/msg/LaserScan` | **11.7 Hz** | 775 range samples per revolution, 16m range |
| `/odom` | `nav_msgs/msg/Odometry` | **50.0 Hz** | Tracked encoder odometry with kinematic covariance |
| `/hiwonder/imu/data_raw` | `sensor_msgs/msg/Imu` | **30.0 Hz** | 3-axis linear acceleration and angular velocity |
| `/hiwonder/gps/nmea` | `std_msgs/msg/String` | **10.0 Hz** | Raw satellite NMEA sentences ($GNGGA, $GNRMC, etc.) |
| `/hiwonder/gps/fix` | `sensor_msgs/msg/NavSatFix` | **1.0 Hz** | Published when outdoor 3D satellite fix is acquired |
| `/battery_state` | `sensor_msgs/msg/BatteryState` | **1.0 Hz** | Sabertooth live battery voltage telemetry |
| `/tf` | `tf2_msgs/msg/TFMessage` | Dynamic | Continuous `odom -> base_link` transform |
| `/tf_static` | `tf2_msgs/msg/TFMessage` | Latched | Static geometric links (`lidar_link_1`, `imu_link`, etc.) |

---

## 8. FastDDS Middleware & Host Discovery

ROS 2 Jazzy utilizes FastDDS. In standard configurations, FastDDS uses shared memory (`SHM`), which can cause deadlocks (`/dev/shm` mutex corruption) when containers restart rapidly.

* **Transport Configuration**: `docker/config/fastdds_udp.xml` explicitly configures UDPv4 loopback and disables builtin shared-memory transports.
* **Host Networking**: Containers run with `network_mode: host`.
* **Cross-Boundary Introspection**: Because UDPv4 runs directly over loopback (`127.0.0.1`), any ROS 2 command executed on the host (`ros2 topic list`, `ros2 topic echo`) communicates seamlessly with nodes running inside the container.

---

## 9. Persistent Data Storage

Important robot data survives container recreation via host-mounted volumes:
* **Maps (`maps/` $\rightarrow$ `/opt/amr/maps`)**: 2D/3D maps saved via SLAM Toolbox or Map Server persist on the host filesystem.
* **Logs (`log/docker_ros_log/` $\rightarrow$ `/home/ubuntu/.ros/log`)**: All ROS 2 node execution and launch logs are written directly to the host for post-mission diagnostics.

*Note on Saved Map*: Dynamic SLAM operates out of the box. If static localization (AMCL) is required, capture and save a map to `maps/` prior to bringup:
```bash
ros2 run nav2_map_server map_saver_cli -f /home/ubuntu/Desktop/Xtrmbly/maps/my_map
```

---

## 10. Rubik Pi 3 Deployment

* **Processor**: Qualcomm QCS6490 Octa-Core ARM64
* **Operating System**: Ubuntu 24.04 LTS (Kernel 6.8.0-1071-qcom)
* **Configuration Profile**: `docker/profiles/rubik-pi.env`
* **GPIO Interface**: Qualcomm TLMM character device (`/dev/gpiochip4`), Pin 8 (CH1) and Pin 24 (CH2)
* **Status**: Fully verified and operational.

---

## 11. Jetson Orin Nano Migration

The Docker architecture is structured for seamless transition to NVIDIA Jetson Orin Nano:
* **Configuration Profile**: `docker/profiles/jetson-orin-nano.env`
* **Application Code**: 100% identical.
* **Host Tasks for Jetson**:
  1. Copy `udev_rules/99-amr.rules` to `/etc/udev/rules.d/`.
  2. Verify 40-pin GPIO pin numbers for the radio receiver (defined in `jetson-orin-nano.env`).
  3. Enable NVIDIA Container Runtime (`runtime: nvidia`) in `docker-compose.yml` if hardware-accelerated GPU inference or VSLAM is added.
* **Status**: **Prepared but not yet hardware-validated.**

---

## 12. Troubleshooting Guide

### Container Fails to Start
```bash
docker compose ps
docker compose logs amr-ros
```
* If an error indicates `device not found`, run `ls -l /dev/amr_*` to verify which USB sensor is unplugged.

### Permission Denied on Serial Ports
Ensure user belongs to `dialout` and `video` groups on the host:
```bash
sudo usermod -aG dialout,video $USER
```

### ROS Topics Not Visible on Host
Ensure `fastdds_udp.xml` is exported in your host terminal:
```bash
source /opt/ros/jazzy/setup.bash
export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
ros2 topic list
```

### Radio Teleop Failsafe Active
Check `/radio/status`. If `failsafe=True`, the transmitter is off or signal wiring is loose. Verify pins on `/dev/gpiochip4`.

---

## 13. Development Workflow

To modify ROS 2 packages and rebuild the container:
1. Edit package source files inside `src/`.
2. Rebuild the image:
   ```bash
   docker compose build
   ```
3. Rerun in safe sensors-only mode to verify changes:
   ```bash
   ./docker/scripts/run_container.sh --sensors-only
   ```
*Do not manually edit compiled files inside a running container; always rebuild from source.*

---

## 14. Native Rollback Procedure

The host native ROS installation remains intact and fully functional. To rollback:
```bash
# 1. Stop all Docker containers
./docker/scripts/stop_container.sh

# 2. Run native bringup
./start_all.sh
# OR:
ros2 launch rock_bringup navigation.launch.py
```

---

## 15. Architectural Rationale & Design Decisions

| Decision | Engineering Rationale |
| :--- | :--- |
| **Host Networking (`network_mode: host`)** | Eliminates Docker bridge NAT and multicast discovery barriers, allowing low-latency DDS communication and seamless host tooling introspection. |
| **`/dev/amr_*` Device Layer** | Decouples ROS application from physical USB enumeration. Identical device names exist across Rubik Pi and Jetson Orin Nano. |
| **Udev on Host OS** | Udev requires Linux kernel netlink sockets and device management, which belongs strictly on the host layer. |
| **Explicit Device Passthrough** | Enforces least-privilege security by mapping only required sensors, avoiding dangerous `--privileged` flags or mounting all of `/dev`. |
| **Non-Root Execution (`ubuntu` 1000:1000)** | Standard Linux security hardening. Device access is granted via `dialout` and `video` groups. |
| **FastDDS SHM Disabled** | FastRTPS shared memory (`/dev/shm`) mutexes cause container restart deadlocks. UDPv4 loopback transport is reliable and immune to container restarts. |
| **Native ROS Preserved** | Ensures immediate zero-risk operational rollback if field issues arise. |
| **Platform Profiles (`.env`)** | Isolates board-specific differences (such as GPIO chip numbers) into configuration files without touching core ROS 2 source code. |

---

## 16. Project Verification Status

### Verified & Operational on Rubik Pi 3:
* [x] Multi-stage ARM64 Docker image build (`hybrid-amr:latest`)
* [x] ROS 2 Jazzy Jalisco runtime environment
* [x] YDLIDAR G4 scanning at 11.7 Hz (`/scan`)
* [x] ESP32-S3 wheel odometry at 50 Hz (`/odom`)
* [x] Hiwonder 9-DOF IMU streaming at 30 Hz (`/hiwonder/imu/data_raw`)
* [x] Hiwonder GPS receiving satellite NMEA sentences at 10 Hz (`/hiwonder/gps/nmea`)
* [x] HOT RC DS-600 radio receiver edge monitoring on `/dev/gpiochip4`
* [x] Sabertooth 2x32 motor control with active watchdog
* [x] Full kinematic TF tree (`odom -> base_link -> sensors`)
* [x] ROSBridge WebSocket communication on port 9090
* [x] Host/container FastDDS UDP topic discovery
* [x] Native rollback operational

### Prepared (Not Yet Hardware Validated):
* [ ] Physical deployment on NVIDIA Jetson Orin Nano compute board
* [ ] NVIDIA Container Toolkit GPU-accelerated VSLAM pipeline
