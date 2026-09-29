#!/usr/bin/env bash
# ==============================================================================
# stop_container.sh — Gracefully terminate all Hybrid-AMR Docker Containers
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$WORKSPACE_DIR/docker"

echo "🛑 Stopping all Hybrid-AMR Docker Containers..."

DOCKER_CMD="docker"
if ! docker info > /dev/null 2>&1; then
    if sudo -n docker info > /dev/null 2>&1 || sudo docker info > /dev/null 2>&1; then
        DOCKER_CMD="sudo docker"
    fi
fi

# 1. Stop compose stack if running
if [ -f "$DOCKER_DIR/docker-compose.yml" ]; then
    $DOCKER_CMD compose -f "$DOCKER_DIR/docker-compose.yml" down --timeout 5 2>/dev/null || true
fi

# 2. Stop individual standalone debug/sensor containers if running
$DOCKER_CMD stop amr_ros_core amr_rosbridge amr_ros_sensors amr_ros_debug 2>/dev/null || true
$DOCKER_CMD rm amr_ros_core amr_rosbridge amr_ros_sensors amr_ros_debug 2>/dev/null || true

echo "✅ All Hybrid-AMR containers stopped successfully."
