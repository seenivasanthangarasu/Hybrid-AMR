#!/usr/bin/env bash
# ==============================================================================
# stop_all.sh — Gracefully terminate all Hybrid-AMR Dashboard, ROSBridge & Robot Stack
# ==============================================================================

echo "🛑 Shutting down all Hybrid-AMR Dashboard & Backend Services..."

# 1. Stop Robot Stack ROS 2 nodes & helper scripts
pkill -f navigation.launch.py 2>/dev/null || true
pkill -f rock_bringup 2>/dev/null || true
pkill -f esp32_odom 2>/dev/null || true
pkill -f hiwonder_imu 2>/dev/null || true
pkill -f hiwonder_gps 2>/dev/null || true
pkill -f ydlidar_ros2_driver 2>/dev/null || true
pkill -f slam_toolbox 2>/dev/null || true
pkill -f robot_state_publisher 2>/dev/null || true
pkill -f joint_state_publisher 2>/dev/null || true
pkill -f sabertooth 2>/dev/null || true
pkill -f radio_receiver 2>/dev/null || true
pkill -f camera_streamer.py 2>/dev/null || true
pkill -f depth_colorizer.py 2>/dev/null || true
pkill -f diagnostic_cam.py 2>/dev/null || true
pkill -f v4l2_camera 2>/dev/null || true
pkill -f session_publisher 2>/dev/null || true

# 2. Stop ROSBridge & Web Video Server
pkill -f rosbridge_websocket 2>/dev/null || true
pkill -f web_video_server 2>/dev/null || true

# 3. Stop Frontend & Backend Servers
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 9090/tcp 2>/dev/null || true
pkill -f "python3 server/server.py" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo "✅ All Hybrid-AMR services have been shut down cleanly."
