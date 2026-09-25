import os
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    pkg_bringup = FindPackageShare('rock_bringup')
    pkg_esp32_odom = FindPackageShare('esp32_odom')

    ekf_local_config = PathJoinSubstitution([
        pkg_bringup,
        'config',
        'ekf_local.yaml'
    ])

    odom_params_config = PathJoinSubstitution([
        pkg_esp32_odom,
        'config',
        'esp32_odom_params.yaml'
    ])

    # 1. ESP32 Tracked Wheel/Encoder Odometry Node (publish_tf: false since EKF publishes TF)
    esp32_odom_node = Node(
        package='esp32_odom',
        executable='odom_node',
        name='esp32_odom',
        output='screen',
        parameters=[
            odom_params_config,
            {'publish_tf': False}
        ]
    )

    # 2. Hiwonder 9-DOF IMU Node
    hiwonder_imu_node = Node(
        package='hiwonder_imu',
        executable='hiwonder_imu_node',
        name='hiwonder_imu_node',
        output='screen',
        parameters=[{
            'port': '/dev/hiwonder_imu',
            'baudrate': 9600,
            'frame_id': 'imu_link'
        }]
    )

    # 3. Local EKF Filter Node (odom -> base_link TF & /odometry/filtered)
    ekf_local_node = Node(
        package='robot_localization',
        executable='ekf_node',
        name='ekf_filter_node_local',
        output='screen',
        parameters=[ekf_local_config],
        remappings=[
            ('odometry/filtered', '/odometry/filtered')
        ]
    )

    return LaunchDescription([
        esp32_odom_node,
        hiwonder_imu_node,
        ekf_local_node
    ])
