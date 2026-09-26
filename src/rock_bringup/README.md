# rock_bringup

Top-level system launch and configuration package for the **Hybrid-AMR** platform on **ROS 2 Jazzy**.

## 🚀 Launch Files

| Launch File | Description | Primary Arguments |
|---|---|---|
| `navigation.launch.py` | Full robot bringup: robot state publisher, ESP32 odometry, Hiwonder IMU & GPS, YDLIDAR G4, SLAM localization, and optional manual drive & camera. | `start_camera:=true/false`, `start_manual_drive:=true/false`, `start_rviz:=true/false` |
| `mapping.launch.py` | 2D SLAM mapping bringup using `slam_toolbox` in mapping mode (`mapper_mapping.yaml`). | `start_manual_drive:=true/false`, `start_rviz:=true/false` |
| `localization_local.launch.py` | Stage 1 EKF local odometry filtering (`/odom` + `/hiwonder/imu/data_raw` -> `/odometry/filtered` and `odom -> base_link`). | — |
| `localization_global.launch.py` | Stage 2 EKF global earth-frame localization fusing local odometry with GNSS coordinates. | — |
| `web_video_server.launch.py` | Multi-threaded `web_video_server` instance on port 8082 (4 server threads, 2 ROS threads). | — |

## ⚙️ Configuration Files

* `config/ekf_local.yaml`: Stage 1 EKF local odometry filter config.
* `config/ekf_global.yaml`: Stage 2 EKF global odometry filter config.
* `config/navsat_transform.yaml`: GPS NavSatTransform configuration.
* `config/mapper_mapping.yaml`: SLAM Toolbox 2D mapping parameters.
* `config/mapper_localization.yaml`: SLAM Toolbox 2D localization parameters.
