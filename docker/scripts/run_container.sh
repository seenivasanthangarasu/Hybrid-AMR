#!/usr/bin/env bash
# ==============================================================================
# run_container.sh — Safe, Robust Runner for Hybrid-AMR Docker Container
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$WORKSPACE_DIR/docker"

MODE="${1:---sensors-only}"

echo "=============================================================================="
echo "🤖 Hybrid-AMR Docker Container Launcher"
echo "=============================================================================="

# 1. Environment & Prerequisite Checks
if ! command -v docker > /dev/null 2>&1; then
    echo "❌ ERROR: Docker command not found. Please ensure Docker is installed and in PATH."
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "❌ ERROR: Cannot connect to the Docker daemon. Check 'systemctl status docker' or run with sudo/add user to docker group."
    exit 1
fi

if ! docker image inspect hybrid-amr:latest > /dev/null 2>&1; then
    echo "❌ ERROR: Docker image 'hybrid-amr:latest' not found."
    echo "   Please build the image first using:"
    echo "     cd $WORKSPACE_DIR && docker compose build"
    exit 1
fi

# 2. Hardware Device Presence Checks
REQUIRED_DEVICES=(
    "/dev/amr_sabertooth"
    "/dev/amr_encoder"
    "/dev/amr_lidar"
    "/dev/amr_imu"
    "/dev/amr_gps"
    "/dev/gpiochip4"
)

MISSING_DEVICES=()
for dev in "${REQUIRED_DEVICES[@]}"; do
    if [ ! -e "$dev" ]; then
        MISSING_DEVICES+=("$dev")
    fi
done

if [ ${#MISSING_DEVICES[@]} -ne 0 ]; then
    echo "⚠️  WARNING: The following expected hardware devices were not found on the host:"
    for mdev in "${MISSING_DEVICES[@]}"; do
        echo "   - $mdev"
    done
    echo "   Ensure udev rules are loaded (/etc/udev/rules.d/99-amr.rules) and USB cables are plugged in."
fi

# 3. Safety Check: Ensure no native motor driver is running on the host
if pgrep -f "sabertooth_node" > /dev/null; then
    echo "⚠️  CRITICAL SAFETY WARNING: Native sabertooth_node is running on the host!"
    echo "   Simultaneous motor control from host and container is strictly prohibited."
    echo "   Stopping native motor node..."
    pkill -f "sabertooth_node" || true
    sleep 1
fi

if pgrep -f "navigation.launch.py" > /dev/null; then
    echo "⚠️  CRITICAL SAFETY WARNING: Native navigation stack is running on host!"
    echo "   Stopping native navigation stack..."
    pkill -f "navigation.launch.py" || true
    sleep 1
fi

# Ensure persistent directories exist
mkdir -p "$WORKSPACE_DIR/maps"
mkdir -p "$WORKSPACE_DIR/log/docker_ros_log"

case "$MODE" in
    --sensors-only)
        echo "🔬 Starting container in SENSORS-ONLY mode (motors inactive)..."
        docker run -it --rm \
            --name amr_ros_sensors \
            --network host \
            --ipc host \
            --user 1000:1000 \
            --group-add dialout \
            --group-add video \
            --env-file "$DOCKER_DIR/profiles/rubik-pi.env" \
            --device /dev/amr_sabertooth:/dev/amr_sabertooth \
            --device /dev/amr_encoder:/dev/amr_encoder \
            --device /dev/amr_lidar:/dev/amr_lidar \
            --device /dev/amr_imu:/dev/amr_imu \
            --device /dev/amr_gps:/dev/amr_gps \
            --device /dev/amr_camera:/dev/amr_camera \
            --device /dev/gpiochip4:/dev/gpiochip4 \
            -v "$DOCKER_DIR/config/fastdds_udp.xml:/opt/amr/config/fastdds_udp.xml:ro" \
            -v "$WORKSPACE_DIR/maps:/opt/amr/maps:rw" \
            -v "$WORKSPACE_DIR/log/docker_ros_log:/home/ubuntu/.ros/log:rw" \
            hybrid-amr:latest \
            ros2 launch rock_bringup navigation.launch.py start_manual_drive:=false
        ;;
    --full)
        echo "🚀 Starting full AMR stack via Docker Compose..."
        docker compose -f "$DOCKER_DIR/docker-compose.yml" up -d
        echo "✅ Hybrid-AMR services started in background. Inspect with: docker compose -f $DOCKER_DIR/docker-compose.yml logs -f"
        ;;
    --shell)
        echo "💻 Opening interactive diagnostic bash shell inside container..."
        docker run -it --rm \
            --name amr_ros_debug \
            --network host \
            --ipc host \
            --user 1000:1000 \
            --group-add dialout \
            --group-add video \
            --env-file "$DOCKER_DIR/profiles/rubik-pi.env" \
            --device /dev/amr_sabertooth:/dev/amr_sabertooth \
            --device /dev/amr_encoder:/dev/amr_encoder \
            --device /dev/amr_lidar:/dev/amr_lidar \
            --device /dev/amr_imu:/dev/amr_imu \
            --device /dev/amr_gps:/dev/amr_gps \
            --device /dev/amr_camera:/dev/amr_camera \
            --device /dev/gpiochip4:/dev/gpiochip4 \
            -v "$DOCKER_DIR/config/fastdds_udp.xml:/opt/amr/config/fastdds_udp.xml:ro" \
            -v "$WORKSPACE_DIR/maps:/opt/amr/maps:rw" \
            -v "$WORKSPACE_DIR/log/docker_ros_log:/home/ubuntu/.ros/log:rw" \
            hybrid-amr:latest \
            bash
        ;;
    *)
        echo "Usage: $0 [--sensors-only | --full | --shell]"
        echo "   --sensors-only : Run navigation with motors inactive for safe sensor validation"
        echo "   --full         : Run full autonomous stack via Docker Compose (background daemon)"
        echo "   --shell        : Open interactive bash prompt inside container for debugging"
        exit 1
        ;;
esac
