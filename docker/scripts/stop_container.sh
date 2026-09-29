#!/usr/bin/env bash
# ==============================================================================
# stop_container.sh — Gracefully terminate all Hybrid-AMR Docker Containers
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$WORKSPACE_DIR/docker"

echo "🛑 Stopping all Hybrid-AMR Docker Containers..."

# 1. Stop compose stack if running
if [ -f "$DOCKER_DIR/docker-compose.yml" ]; then
    docker compose -f "$DOCKER_DIR/docker-compose.yml" down --timeout 5 2>/dev/null || true
fi

# 2. Stop individual standalone debug/sensor containers if running
docker stop amr_ros_core amr_rosbridge amr_ros_sensors amr_ros_debug 2>/dev/null || true
docker rm amr_ros_core amr_rosbridge amr_ros_sensors amr_ros_debug 2>/dev/null || true

echo "✅ All Hybrid-AMR containers stopped successfully."
