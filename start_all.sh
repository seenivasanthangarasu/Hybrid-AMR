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

# Disable USB autosuspend on all USB and PCI controller devices & refresh root hub
sudo bash -c '
echo 0 > /sys/module/usbcore/parameters/autosuspend 2>/dev/null || true
for f in /sys/bus/usb/devices/usb*/power/control /sys/bus/pci/devices/*/power/control; do
    [ -f "$f" ] && echo on > "$f" 2>/dev/null || true
done
for f in /sys/bus/usb/devices/*/power/autosuspend_delay_ms; do
    [ -f "$f" ] && echo -1 > "$f" 2>/dev/null || true
done
if [ -f /sys/bus/usb/devices/usb1/authorized ]; then
    echo 0 > /sys/bus/usb/devices/usb1/authorized 2>/dev/null || true
    sleep 0.5
    echo 1 > /sys/bus/usb/devices/usb1/authorized 2>/dev/null || true
    sleep 1.5
fi
' 2>/dev/null || true

# 2. Cleanup any stale processes on ports 9090, 8080, 5001, 3000 and helper nodes
echo "🧹 Checking & freeing ports (9090, 8080, 5001, 3000)..."
fuser -k 9090/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
pkill -f depth_colorizer.py 2>/dev/null || true
sleep 0.5

# 3. Start ROSBridge WebSocket Server (Port 9090)
echo "📡 Launching ROSBridge WebSocket Server (port 9090)..."
nohup ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 </dev/null > /tmp/rosbridge.log 2>&1 &
ROSBRIDGE_PID=$!
echo "   ↳ ROSBridge PID: $ROSBRIDGE_PID"

# 4. Start Web Video Server for MJPEG Video Streaming (Port 8080)
echo "📹 Launching Web Video Server (port 8080)..."
nohup ros2 run web_video_server web_video_server </dev/null > /tmp/web_video_server.log 2>&1 &
VIDEO_SERVER_PID=$!
echo "   ↳ Video Server PID: $VIDEO_SERVER_PID"

# 4b. Start Depth Image Colorizer (Colorizes 16UC1 depth to bgr8 for streaming)
echo "🌈 Starting Depth Image Colorizer..."
nohup python3 "$WORKSPACE_DIR/admin-dashboard/server/depth_colorizer.py" </dev/null > /tmp/depth_colorizer.log 2>&1 &
DEPTH_PID=$!
echo "   ↳ Depth Colorizer PID: $DEPTH_PID"

# 5. Start Admin Backend Server (Port 5001)
echo "⚙️  Starting Flask Admin Backend API (port 5001)..."
cd "$WORKSPACE_DIR/admin-dashboard"
nohup python3 server/server.py </dev/null > /tmp/admin_server.log 2>&1 &
BACKEND_PID=$!
echo "   ↳ Backend PID: $BACKEND_PID"

# 6. Start Vite Frontend Server (Port 3000)
echo "🌐 Starting Vite Dashboard Frontend (port 3000)..."
nohup npm run dev -- --host 0.0.0.0 --port 3000 </dev/null > /tmp/admin_frontend.log 2>&1 &
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
