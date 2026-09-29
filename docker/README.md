# Hybrid-AMR Docker Operational Manual

This guide details the technical operation, lifecycle commands, container layout, and hardware interface for the Hybrid-AMR Docker deployment.

---

## 1. Architectural Overview

The Hybrid-AMR Docker environment decouples the core robotics software stack from the underlying host computer, enabling cross-architecture portability between the **Thundercomm Rubik Pi 3** (Qualcomm QCS6490) and the **NVIDIA Jetson Orin Nano**.

```
Host OS (Linux Kernel, Udev, Hardware Drivers, Docker Engine)
   │
   ├─► Explicit Device Nodes (/dev/amr_*, /dev/gpiochip4)
   ├─► FastDDS UDPv4 Host Networking (network_mode: host)
   │
   ▼
Docker Container Stack (hybrid-amr:latest, Non-Root ubuntu 1000:1000)
   ├── amr-ros: rock_bringup, slam_toolbox, drivers, kinematics, teleop
   └── amr-rosbridge: Tornado WebSocket on port 9090
```

---

## 2. Host Prerequisites

1. **Host Operating System**: Ubuntu 24.04 LTS (Kernel 6.8+ on ARM64 `aarch64`).
2. **Container Engine**: Docker Engine v24+ or v29+ with Compose v2 plugin (`docker compose`).
3. **Udev Rules**: `/etc/udev/rules.d/99-amr.rules` must be installed on the host to create deterministic `/dev/amr_*` devices:
   ```bash
   sudo cp udev_rules/99-amr.rules /etc/udev/rules.d/99-amr.rules
   sudo udevadm control --reload-rules && sudo udevadm trigger
   ```
4. **Group Permissions**: The current host user must belong to `docker`, `dialout`, and `video`:
   ```bash
   sudo usermod -aG docker,dialout,video $USER
   ```

---

## 3. Hardware Device Mapping

The container strictly maps explicit device files. `privileged: true` is **not** used.

| Component | Host Node | Container Node | Mode & Group | Target Node |
| :--- | :--- | :--- | :--- | :--- |
| **Sabertooth 2x32 Driver** | `/dev/amr_sabertooth` | `/dev/amr_sabertooth` | `0660 dialout` | `sabertooth_node` |
| **ESP32 Wheel Encoders** | `/dev/amr_encoder` | `/dev/amr_encoder` | `0660 dialout` | `odom_node` |
| **YDLIDAR G4 Scanner** | `/dev/amr_lidar` | `/dev/amr_lidar` | `0660 dialout` | `ydlidar_ros2_driver_node` |
| **Hiwonder 9-DOF IMU** | `/dev/amr_imu` | `/dev/amr_imu` | `0660 dialout` | `hiwonder_imu_node` |
| **Hiwonder GNSS GPS** | `/dev/amr_gps` | `/dev/amr_gps` | `0660 dialout` | `gps_node` |
| **USB Video Camera** | `/dev/amr_camera` | `/dev/amr_camera` | `0660 video` | `v4l2_camera_node` |
| **HOT RC Radio Teleop** | `/dev/gpiochip4` | `/dev/gpiochip4` | `0666` | `radio_receiver_node` |

---

## 4. Multi-Stage Build & Rebuild

The `Dockerfile` employs a multi-stage architecture:
1. **Builder Stage**: Builds `YDLidar-SDK` into `/usr/local` and compiles all ROS 2 packages using `colcon build`.
2. **Runtime Stage**: Copies compiled artifacts into a lean runtime image containing only required Python and ROS runtime libraries. Compilers and build dependencies are discarded.

### Build Commands:
```bash
# Build using docker compose
docker compose build

# Rebuild without caching
docker compose build --no-cache

# Build directly using docker CLI
docker build -t hybrid-amr:latest -f docker/Dockerfile .
```

---

## 5. Container Execution Modes

The operational script `./docker/scripts/run_container.sh` provides safe, isolated execution modes:

### Mode 1: Sensors-Only Mode (`--sensors-only`)
*Recommended for software validation, sensor inspection, and calibration.*  
Motors and radio teleop are disabled (`start_manual_drive:=false`). Wheels will not move.
```bash
./docker/scripts/run_container.sh --sensors-only
```

### Mode 2: Full Production Mode (`--full`)
*Runs the full navigation, SLAM, motor driver, and radio teleop stack in the background via Docker Compose.*
```bash
./docker/scripts/run_container.sh --full
# OR:
docker compose up -d
```

### Mode 3: Interactive Diagnostic Shell (`--shell`)
*Opens an interactive bash terminal inside the configured container environment with all devices mapped.*
```bash
./docker/scripts/run_container.sh --shell
```

---

## 6. Shutdown & Cleanup

To stop all running AMR containers gracefully:
```bash
./docker/scripts/stop_container.sh
# OR:
docker compose down
```

---

## 7. Log Inspection & Monitoring

ROS 2 logs are persistently stored on the host filesystem under `log/docker_ros_log/`.

```bash
# Stream live logs from the core ROS container
docker logs -f amr_ros_core

# Stream live logs from the ROSBridge WebSocket container
docker logs -f amr_rosbridge

# Inspect persistent host log files
tail -f log/docker_ros_log/latest/*.log

# View live container resource consumption
docker stats
```

---

## 8. Cross-Platform Profiles

Hardware differences between compute boards are encapsulated in `docker/profiles/`:

### Rubik Pi 3 (`docker/profiles/rubik-pi.env`):
* `RADIO_GPIO_CHIP=gpiochip4`
* `RADIO_CH1_PIN=8`
* `RADIO_CH2_PIN=24`

### Jetson Orin Nano (`docker/profiles/jetson-orin-nano.env`):
* `RADIO_GPIO_CHIP=gpiochip1` (Jetson 40-pin header)
* `RADIO_CH1_PIN=12`
* `RADIO_CH2_PIN=13`

---

## 9. Jetson Orin Nano Migration Checklist

When transitioning this software to an NVIDIA Jetson Orin Nano:
1. Copy `udev_rules/99-amr.rules` to `/etc/udev/rules.d/` on Jetson and reload rules.
2. In `docker/docker-compose.yml`, change `env_file` from `rubik-pi.env` to `jetson-orin-nano.env`.
3. If GPU-accelerated VSLAM or TensorRT inference is added, install `nvidia-container-toolkit` on Jetson and add `runtime: nvidia` to `docker-compose.yml`.
4. Deploy using `docker compose up -d`. **Zero ROS 2 application code changes are required.**

---

## 10. Troubleshooting

| Symptom | Probable Cause | Remediation |
| :--- | :--- | :--- |
| **`device not found` during startup** | A USB cable is unplugged or udev did not trigger | Run `ls -l /dev/amr_*` to identify missing device; replug cable |
| **`Permission denied: '/dev/...'`** | Host user not in `dialout`/`video` | Run `sudo usermod -aG dialout,video $USER` and log back in |
| **Topics invisible on host** | FastDDS profile not sourced | Run `export FASTRTPS_DEFAULT_PROFILES_FILE=/path/to/fastdds_udp.xml` |
| **Duplicate motor control warning** | Native `sabertooth_node` active on host | `./docker/scripts/run_container.sh` automatically kills host instances |
| **Radio failsafe held active** | Remote transmitter is off or pins loose | Verify wiring to GPIO pins and check transmitter battery |
