# ==============================================================================
# Hybrid-AMR ROS 2 Jazzy Production Dockerfile
# Architectures: linux/arm64 (Thundercomm Rubik Pi 3 / NVIDIA Jetson Orin Nano)
# Base Distribution: Ubuntu 24.04 LTS (Noble) + ROS 2 Jazzy Jalisco
# ==============================================================================

# ------------------------------------------------------------------------------
# STAGE 1: Builder
# ------------------------------------------------------------------------------
FROM ros:jazzy-ros-base AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /workspace

# 1. Install build tools and development dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    python3-colcon-common-extensions \
    python3-pip \
    python3-libgpiod \
    python3-serial \
    python3-numpy \
    ros-jazzy-robot-state-publisher \
    ros-jazzy-joint-state-publisher \
    ros-jazzy-xacro \
    ros-jazzy-tf2-ros \
    ros-jazzy-nav-msgs \
    ros-jazzy-sensor-msgs \
    ros-jazzy-geometry-msgs \
    ros-jazzy-diagnostic-msgs \
    ros-jazzy-visualization-msgs \
    ros-jazzy-slam-toolbox \
    ros-jazzy-rmw-fastrtps-cpp \
    ros-jazzy-rosbridge-server \
    ros-jazzy-v4l2-camera \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy source packages
COPY src/ /workspace/src/

# Exclude unused mapviz Qt package from build
RUN touch /workspace/src/mapviz/COLCON_IGNORE 2>/dev/null || true

# 3. Build and install YDLidar-SDK system-wide to /usr/local
RUN cd /workspace/src/YDLidar-SDK && \
    mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    touch /workspace/src/YDLidar-SDK/COLCON_IGNORE

# 4. Build remaining ROS 2 packages
RUN . /opt/ros/jazzy/setup.sh && \
    colcon build \
    --packages-skip mapviz mapviz_interfaces mapviz_plugins multires_image tile_map \
    --cmake-args -DCMAKE_BUILD_TYPE=Release

# ------------------------------------------------------------------------------
# STAGE 2: Runtime
# ------------------------------------------------------------------------------
FROM ros:jazzy-ros-base AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV ROS_DISTRO=jazzy
ENV RMW_IMPLEMENTATION=rmw_fastrtps_cpp
ENV ROS_DOMAIN_ID=0
ENV FASTRTPS_DEFAULT_PROFILES_FILE=/opt/amr/config/fastdds_udp.xml
ENV PYTHONUNBUFFERED=1

# 1. Install runtime dependencies only (no compiler toolchain)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-libgpiod \
    python3-serial \
    python3-numpy \
    ros-jazzy-robot-state-publisher \
    ros-jazzy-joint-state-publisher \
    ros-jazzy-xacro \
    ros-jazzy-tf2-ros \
    ros-jazzy-nav-msgs \
    ros-jazzy-sensor-msgs \
    ros-jazzy-geometry-msgs \
    ros-jazzy-diagnostic-msgs \
    ros-jazzy-visualization-msgs \
    ros-jazzy-slam-toolbox \
    ros-jazzy-rmw-fastrtps-cpp \
    ros-jazzy-rosbridge-server \
    ros-jazzy-v4l2-camera \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# 2. Provision directories
WORKDIR /opt/amr/workspace

# Copy YDLidar-SDK libraries and headers from builder
COPY --from=builder /usr/local/lib/libydlidar_sdk.a /usr/local/lib/
COPY --from=builder /usr/local/include/src /usr/local/include/src
COPY --from=builder /usr/local/lib/cmake/ydlidar_sdk /usr/local/lib/cmake/ydlidar_sdk
RUN ldconfig

# Copy built workspace from builder stage
COPY --from=builder /workspace/install /opt/amr/workspace/install
COPY src /opt/amr/workspace/src

# 3. Backward-compatibility layer for preexisting hardcoded paths
RUN mkdir -p /home/ubuntu/Desktop && \
    ln -sf /opt/amr/workspace /home/ubuntu/Desktop/Xtrmbly && \
    mkdir -p /opt/amr/config /opt/amr/maps /opt/amr/scripts /home/ubuntu/2_maps /home/ubuntu/.ros/log

# Copy configuration and runtime scripts
COPY docker/config/fastdds_udp.xml /opt/amr/config/fastdds_udp.xml
COPY docker/scripts/entrypoint.sh /opt/amr/scripts/entrypoint.sh
RUN chmod +x /opt/amr/scripts/entrypoint.sh

# 4. Permissions: add user ubuntu to dialout and video groups
RUN usermod -aG dialout,video ubuntu && \
    chown -R ubuntu:ubuntu /opt/amr /home/ubuntu

USER ubuntu
WORKDIR /opt/amr/workspace

ENTRYPOINT ["/opt/amr/scripts/entrypoint.sh"]
CMD ["ros2", "launch", "rock_bringup", "navigation.launch.py"]
