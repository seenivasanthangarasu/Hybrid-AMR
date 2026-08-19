from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch.launch_description_sources import PythonLaunchDescriptionSource

from launch_ros.actions import Node

from ament_index_python.packages import get_package_share_directory

import os


def generate_launch_description():

    # -----------------------------
    # Launch Arguments
    # -----------------------------
    start_camera_arg = DeclareLaunchArgument(
        'start_camera',
        default_value='false',
        description='Whether to start the optional camera driver / stream'
    )

    start_rviz_arg = DeclareLaunchArgument(
        'start_rviz',
        default_value='false',
        description='Whether to start GUI RViz2'
    )

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
        output='screen',
        condition=IfCondition(LaunchConfiguration('start_rviz'))
    )

    # -----------------------------
    # Camera Node (Optional)
    # -----------------------------
    camera_node = Node(
        package='v4l2_camera',
        executable='v4l2_camera_node',
        name='v4l2_camera_node',
        output='screen',
        parameters=[{
            'video_device': '/dev/video0',
            'image_size': [640, 480],
            'time_per_frame': [1, 30]
        }],
        condition=IfCondition(LaunchConfiguration('start_camera'))
    )

    return LaunchDescription([
        start_camera_arg,
        start_rviz_arg,
        robot_launch,
        lidar_launch,
        odom_node,
        imu_node,
        slam_node,
        rviz_node,
        camera_node
    ])
