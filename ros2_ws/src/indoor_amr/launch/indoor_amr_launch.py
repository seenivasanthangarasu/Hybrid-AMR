from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, TimerAction
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node

from ament_index_python.packages import get_package_share_directory
import os


def generate_launch_description():

    # -----------------------------
    # 1. ODOM NODE (START FIRST)
    # -----------------------------
    odom_node = TimerAction(
        period=0.0,
        actions=[
            Node(
                package='esp32_odom',
                executable='odom_node',
                output='screen'
            )
        ]
    )

    # -----------------------------
    # 2. STATIC TF (base_link -> laser_frame)
    # -----------------------------
    static_tf = TimerAction(
        period=2.0,
        actions=[
            Node(
                package='tf2_ros',
                executable='static_transform_publisher',
                name='base_to_laser_tf',
                arguments=['0', '0', '0.02', '0', '0', '0', 'base_link', 'laser_frame'],
                output='screen'
            )
        ]
    )

    # -----------------------------
    # 3. LIDAR (START AFTER TF)
    # -----------------------------
    lidar_launch = TimerAction(
        period=5.0,
        actions=[
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(
                    os.path.join(
                        get_package_share_directory('ydlidar_ros2_driver'),
                        'launch',
                        'ydlidar_launch.py'
                    )
                )
            )
        ]
    )

    # -----------------------------
    # 4. SLAM TOOLBOX (START LAST)
    # -----------------------------
    slam_launch = TimerAction(
        period=8.0,
        actions=[
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(
                    os.path.join(
                        get_package_share_directory('slam_toolbox'),
                        'launch',
                        'online_async_launch.py'
                    )
                ),
                launch_arguments={
                    'use_sim_time': 'false',
                    'odom_frame': 'odom',
                    'base_frame': 'base_link',
                    'map_frame': 'map'
                }.items()
            )
        ]
    )

    # -----------------------------
    # FINAL LAUNCH
    # -----------------------------
    return LaunchDescription([
        odom_node,
        static_tf,
        lidar_launch,
        slam_launch
    ])
