#!/usr/bin/env bash
# ==============================================================================
# start_all.sh — Single command to bring up Hybrid-AMR Dashboard & Backend Stack
# ==============================================================================

set -e

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🚀 Starting Hybrid-AMR Diagnostic & Control Suite..."
echo "📍 Workspace path: $WORKSPACE_DIR"

# 1. Source ROS 2 Jazzy and Workspace
source /opt/ros/jazzy/setup.bash
if [ -f "$WORKSPACE_DIR/install/setup.bash" ]; then
    source "$WORKSPACE_DIR/install/setup.bash"
fi

export ROS_LOG_DIR=/tmp/ros_log
mkdir -p /tmp/ros_log
export FASTRTPS_DEFAULT_PROFILES_FILE="$WORKSPACE_DIR/fastdds_udp.xml"
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp

# Run USB auto-healing & host controller check
if [ -f "$WORKSPACE_DIR/scripts/usb_heal.sh" ]; then
    sudo "$WORKSPACE_DIR/scripts/usb_heal.sh" || true
fi

# 2. Cleanup any stale processes on ports 9090, 8080, 5001, 3000 and helper nodes
echo "🧹 Checking & freeing ports (9090, 8080, 5001, 3000)..."
fuser -k 9090/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
pkill -f depth_colorizer.py 2>/dev/null || true
pkill -f diagnostic_cam.py 2>/dev/null || true
sleep 0.5

# 3. Start ROSBridge WebSocket Server (Port 9090)
echo "📡 Launching ROSBridge WebSocket Server (port 9090)..."
setsid ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 </dev/null > /tmp/rosbridge.log 2>&1 &
ROSBRIDGE_PID=$!
echo "   ↳ ROSBridge PID: $ROSBRIDGE_PID"

# 4. Start Web Video Server for MJPEG Video Streaming (Port 8080)
echo "📹 Launching Web Video Server (port 8080)..."
setsid ros2 run web_video_server web_video_server </dev/null > /tmp/web_video_server.log 2>&1 &
VIDEO_SERVER_PID=$!
echo "   ↳ Video Server PID: $VIDEO_SERVER_PID"

# 4b. Start Universal Camera Streamer (RealSense RGB/Depth + Telemetry HUD Streamer)
echo "🌈 Starting Universal Camera Streamer..."
pkill -9 -f camera_streamer.py 2>/dev/null || true
pkill -9 -f depth_colorizer.py 2>/dev/null || true
setsid python3 "$WORKSPACE_DIR/admin-dashboard/server/camera_streamer.py" </dev/null > /tmp/camera_streamer.log 2>&1 &
CAMERA_STREAM_PID=$!
echo "   ↳ Camera Streamer PID: $CAMERA_STREAM_PID"

# 5. Start Admin Backend Server (Port 5001)
echo "⚙️  Starting Flask Admin Backend API (port 5001)..."
cd "$WORKSPACE_DIR/admin-dashboard"
setsid python3 server/server.py </dev/null > /tmp/admin_server.log 2>&1 &
BACKEND_PID=$!
echo "   ↳ Backend PID: $BACKEND_PID"

# 6. Start Vite Frontend Server (Port 3000)
echo "🌐 Starting Vite Dashboard Frontend (port 3000)..."
setsid npm run dev -- --host 0.0.0.0 --port 3000 </dev/null > /tmp/admin_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   ↳ Frontend PID: $FRONTEND_PID"

sleep 2
disown -a 2>/dev/null || true

echo ""
echo "=============================================================================="
echo "✅ All Hybrid-AMR services started successfully!"
echo "   - Dashboard UI:   http://localhost:3000 (or http://<ROBOT_IP>:3000)"
echo "   - Backend API:    http://localhost:5001 (or http://<ROBOT_IP>:5001)"
echo "   - ROSBridge WS:   ws://localhost:9090   (or ws://<ROBOT_IP>:9090)"
echo "   - Video Stream:   http://localhost:8080 (or http://<ROBOT_IP>:8080)"
echo "=============================================================================="
echo "👉 Open the Dashboard in your browser and click 'Launch Robot Stack' to begin!"
echo ""
