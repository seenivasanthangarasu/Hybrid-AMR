# outdoor_navigation

Autonomous GPS waypoint navigation package for the **Hybrid-AMR** on **ROS 2 Jazzy**.

## 📌 Features

* **WGS-84 Geodesy (`geodesy.py`)**: Real-time East-North-Up (ENU) tangent-plane projection, Haversine geodesic distance, and Great Circle bearing computations.
* **Deterministic State Machine (`state_machine.py`)**: Safe lifecycle management across 9 discrete operational states (`IDLE`, `WAITING_FOR_GPS`, `WAITING_FOR_VALID_GOAL`, `NAVIGATING`, `OBSTACLE_STOP`, `GPS_LOST`, `GOAL_REACHED`, `ERROR`, `STOPPED`).
* **Active Collision Avoidance**: Real-time forward-arc LiDAR obstacle detection with automatic deceleration and emergency stopping.
* **Failsafe Preemption**: Immediate manual radio transmitter priority override and auto-zeroing on GPS signal loss.

## 🚀 Usage

```bash
ros2 launch outdoor_navigation outdoor_navigation.launch.py
```

## 🧪 Testing

```bash
pytest src/outdoor_navigation/test/
```
