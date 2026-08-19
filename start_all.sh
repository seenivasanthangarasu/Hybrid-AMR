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

# 2. Cleanup any stale processes on ports 9090, 5001, 3000
echo "🧹 Checking & freeing ports (9090, 5001, 3000)..."
fuser -k 9090/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

# 3. Start ROSBridge WebSocket Server (Port 9090)
echo "📡 Launching ROSBridge WebSocket Server (port 9090)..."
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 > /tmp/rosbridge.log 2>&1 &
ROSBRIDGE_PID=$!
echo "   ↳ ROSBridge PID: $ROSBRIDGE_PID"

# 4. Start Admin Backend Server (Port 5001)
echo "⚙️  Starting Flask Admin Backend API (port 5001)..."
cd "$WORKSPACE_DIR/admin-dashboard"
python3 server/server.py > /tmp/admin_server.log 2>&1 &
BACKEND_PID=$!
echo "   ↳ Backend PID: $BACKEND_PID"

# 5. Start Vite Frontend Server (Port 3000)
echo "🌐 Starting Vite Dashboard Frontend (port 3000)..."
npm run dev -- --host 0.0.0.0 --port 3000 > /tmp/admin_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   ↳ Frontend PID: $FRONTEND_PID"

echo ""
echo "=============================================================================="
echo "✅ All Hybrid-AMR services started successfully!"
echo "   - Dashboard UI:  http://localhost:3000 (or http://<ROBOT_IP>:3000)"
echo "   - Backend API:   http://localhost:5001 (or http://<ROBOT_IP>:5001)"
echo "   - ROSBridge WS:  ws://localhost:9090   (or ws://<ROBOT_IP>:9090)"
echo "=============================================================================="
echo "👉 Open the Dashboard in your browser and click 'Launch Robot Stack' to begin!"
echo ""
