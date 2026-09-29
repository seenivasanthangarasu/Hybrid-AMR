#!/usr/bin/env bash
# ==============================================================================
# Hybrid-AMR Docker Runtime Entrypoint
# ==============================================================================
set -e

# 1. Source ROS 2 Jazzy Base Underlay
if [ -f "/opt/ros/jazzy/setup.bash" ]; then
    source /opt/ros/jazzy/setup.bash
fi

# 2. Source AMR Workspace Overlay
if [ -f "/opt/amr/workspace/install/setup.bash" ]; then
    source "/opt/amr/workspace/install/setup.bash"
elif [ -f "/home/ubuntu/Desktop/Xtrmbly/install/setup.bash" ]; then
    source "/home/ubuntu/Desktop/Xtrmbly/install/setup.bash"
fi

# 3. Configure FastDDS UDPv4 Transport and RMW
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
if [ -f "/opt/amr/config/fastdds_udp.xml" ]; then
    export FASTRTPS_DEFAULT_PROFILES_FILE=/opt/amr/config/fastdds_udp.xml
elif [ -f "/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml" ]; then
    export FASTRTPS_DEFAULT_PROFILES_FILE=/home/ubuntu/Desktop/Xtrmbly/fastdds_udp.xml
fi

export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-0}"
export ROS_LOG_DIR="${ROS_LOG_DIR:-/home/ubuntu/.ros/log}"

# 4. Execute user command or default bringup
exec "$@"
