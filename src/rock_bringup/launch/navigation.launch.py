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
    start_gps_arg = DeclareLaunchArgument(
        'start_gps',
        default_value='true',
        description='Whether to start the Hiwonder GPS node to publish /hiwonder/gps/fix'
    )

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
    # Hiwonder GPS -> /hiwonder/gps/fix & /hiwonder/gps/nmea
    # -----------------------------
    gps_node = Node(
        package='hiwonder_gps',
        executable='gps_node',
        name='hiwonder_gps_node',
        output='screen',
        parameters=[{
            'port': '/dev/hiwonder_gps',
            'baud_rate': 9600,
            'frame_id': 'gps_link'
        }],
        condition=IfCondition(LaunchConfiguration('start_gps'))
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
    # Hiwonder 9-DOF IMU -> /hiwonder/imu/data_raw & /hiwonder/imu/mag
    # -----------------------------
    imu_node = Node(
        package='hiwonder_imu',
        executable='hiwonder_imu_node',
        name='hiwonder_imu_node',
        output='screen',
        parameters=[{
            'port': '/dev/hiwonder_imu',
            'baudrate': 9600
        }]
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

    camera_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('realsense2_camera'),
                'launch',
                'rs_launch.py'
            )
        ),
        launch_arguments={
            'initial_reset': 'false',
            'enable_gyro': 'false',
            'enable_accel': 'false',
            'enable_motion': 'false',
            'enable_sync': 'false',
            'enable_color': 'true',
            'enable_depth': 'true',
            'color_qos': 'DEFAULT',
            'depth_qos': 'DEFAULT',
            'depth_module.depth_profile': '480x270x15',
            'rgb_camera.color_profile': '424x240x15',
        }.items(),
        condition=IfCondition(LaunchConfiguration('start_camera'))
    )

    return LaunchDescription([
        start_gps_arg,
        start_camera_arg,
        start_rviz_arg,
        robot_launch,
        gps_node,
        lidar_launch,
        odom_node,
        imu_node,
        slam_node,
        rviz_node,
        camera_launch
    ])

