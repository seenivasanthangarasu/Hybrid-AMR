#!/bin/bash

gnome-terminal -- bash -c "
source /opt/ros/jazzy/setup.bash
ros2 launch realsense2_camera rs_launch.py depth_module.profile:=640x480x15 rgb_camera.profile:=640x480x15
exec bash"

sleep 5

gnome-terminal -- bash -c "
source /opt/ros/jazzy/setup.bash
source ~/Desktop/Xtrmbly/ros2_ws/install/setup.bash 2>/dev/null || source ~/ros2_ws/install/setup.bash
ros2 run esp32_odom odom_node
exec bash"

sleep 2

gnome-terminal -- bash -c "
source /opt/ros/jazzy/setup.bash
ros2 run tf2_ros static_transform_publisher 0.10 0 0.20 0 0 0 base_link camera_link
exec bash"

sleep 2

gnome-terminal -- bash -c "
source /opt/ros/jazzy/setup.bash
source ~/Desktop/Xtrmbly/ros2_ws/install/setup.bash 2>/dev/null || source ~/ros2_ws/install/setup.bash
ros2 launch ydlidar_ros2_driver ydlidar_launch.py
exec bash"

sleep 3

gnome-terminal -- bash -c "
source /opt/ros/jazzy/setup.bash
ros2 run tf2_ros static_transform_publisher 0 0 0.10 0 0 0 base_link lidar_link
exec bash"

sleep 2
