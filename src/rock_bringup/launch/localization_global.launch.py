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

    ekf_global_config = PathJoinSubstitution([
        pkg_bringup,
        'config',
        'ekf_global.yaml'
    ])

    navsat_config = PathJoinSubstitution([
        pkg_bringup,
        'config',
        'navsat_transform.yaml'
    ])

    odom_params_config = PathJoinSubstitution([
        pkg_esp32_odom,
        'config',
        'esp32_odom_params.yaml'
    ])

    # 1. ESP32 Tracked Wheel/Encoder Odometry Node
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

    # 3. Hiwonder GPS Node
    hiwonder_gps_node = Node(
        package='hiwonder_gps',
        executable='gps_node',
        name='hiwonder_gps_node',
        output='screen',
        parameters=[{
            'port': '/dev/hiwonder_gps',
            'baud_rate': 9600,
            'frame_id': 'gps_link'
        }]
    )

    # 4. Local EKF Filter Node (odom -> base_link TF & /odometry/filtered)
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

    # 5. NavSat Transform Node (/hiwonder/gps/fix -> /odometry/gps)
    navsat_transform_node = Node(
        package='robot_localization',
        executable='navsat_transform_node',
        name='navsat_transform',
        output='screen',
        parameters=[navsat_config],
        remappings=[
            ('imu', '/hiwonder/imu/data_raw'),
            ('gps/fix', '/hiwonder/gps/fix'),
            ('odometry/filtered', '/odometry/filtered'),
            ('odometry/gps', '/odometry/gps')
        ]
    )

    # 6. Global EKF Filter Node (map -> odom TF & /odometry/global)
    ekf_global_node = Node(
        package='robot_localization',
        executable='ekf_node',
        name='ekf_filter_node_global',
        output='screen',
        parameters=[ekf_global_config],
        remappings=[
            ('odometry/filtered', '/odometry/global')
        ]
    )

    return LaunchDescription([
        esp32_odom_node,
        hiwonder_imu_node,
        hiwonder_gps_node,
        ekf_local_node,
        navsat_transform_node,
        ekf_global_node
    ])
