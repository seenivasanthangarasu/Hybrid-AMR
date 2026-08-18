from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource

from launch_ros.actions import Node

from ament_index_python.packages import get_package_share_directory

import os


def generate_launch_description():

    # -----------------------------
    # Robot State Publisher
    # -----------------------------
    robot_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('gogo_description'),
                'launch',
                'robot_state_publisher.launch.py'
            )
        )
    )

    # -----------------------------
    # YDLIDAR
    # -----------------------------
    lidar_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('ydlidar_ros2_driver'),
                'launch',
                'ydlidar_launch.py'
            )
        )
    )

    # -----------------------------
    # ESP32 Odom
    # -----------------------------
    odom_node = Node(
        package='esp32_odom',
        executable='odom_node',
        output='screen'
    )

    # -----------------------------
    # GY-80 IMU
    # -----------------------------
    imu_node = Node(
        package='imu_node',
        executable='imu_serial_node',
        name='imu_serial_node',
        output='screen'
    )

    # -----------------------------
    # SLAM Toolbox Localization
    # -----------------------------
    slam_node = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('slam_toolbox'),
                'launch',
                'localization_launch.py'
            )
        ),
        launch_arguments={
            'slam_params_file':
            '/home/ubuntu/Desktop/Xtrmbly/src/rock_bringup/config/mapper_localization.yaml',

            'map_file_name':
            '/home/ubuntu/2_maps/maptest3'

        }.items()
    )

    # -----------------------------
    # RViz
    # -----------------------------
    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        output='screen'
    )

    return LaunchDescription([
        robot_launch,
        lidar_launch,
        odom_node,
        imu_node,
        slam_node,
        rviz_node
    ])
