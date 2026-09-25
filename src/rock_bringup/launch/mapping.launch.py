import os
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch.launch_description_sources import PythonLaunchDescriptionSource

from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    pkg_bringup = get_package_share_directory('rock_bringup')
    pkg_gogo = get_package_share_directory('gogo_description')
    pkg_ydlidar = get_package_share_directory('ydlidar_ros2_driver')
    pkg_esp32_odom = get_package_share_directory('esp32_odom')
    pkg_slam = get_package_share_directory('slam_toolbox')

    # Launch Arguments
    start_rviz_arg = DeclareLaunchArgument(
        'start_rviz',
        default_value='false',
        description='Whether to start RViz2'
    )

    start_manual_drive_arg = DeclareLaunchArgument(
        'start_manual_drive',
        default_value='false',
        description='Whether to start Sabertooth manual radio drive stack (ros2 launch sabertooth_driver manual_radio_drive.launch.py)'
    )

    # 1. Robot State Publisher (URDF & Static Transforms)
    robot_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_gogo, 'launch', 'robot_state_publisher.launch.py')
        )
    )

    # 2. ESP32 Tracked Wheel/Encoder Odometry Node
    odom_params_file = os.path.join(pkg_esp32_odom, 'config', 'esp32_odom_params.yaml')
    odom_node = Node(
        package='esp32_odom',
        executable='odom_node',
        name='esp32_odom',
        output='screen',
        parameters=[odom_params_file]
    )

    # 3. YDLIDAR G4 Laser Scanner Node
    lidar_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_ydlidar, 'launch', 'ydlidar_launch.py')
        )
    )

    # 4. Hiwonder 9-DOF IMU Node
    imu_node = Node(
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

    # 5. SLAM Toolbox Online Async Mapping Node (Managed Lifecycle)
    mapping_params_file = os.path.join(pkg_bringup, 'config', 'mapper_mapping.yaml')
    slam_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_slam, 'launch', 'online_async_launch.py')
        ),
        launch_arguments={
            'slam_params_file': mapping_params_file,
            'use_sim_time': 'false',
            'autostart': 'true'
        }.items()
    )

    # 6. Sabertooth Manual Radio Drive
    manual_radio_drive_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('sabertooth_driver'),
                'launch',
                'manual_radio_drive.launch.py'
            )
        ),
        condition=IfCondition(LaunchConfiguration('start_manual_drive'))
    )

    # 7. Optional RViz2
    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        output='screen',
        condition=IfCondition(LaunchConfiguration('start_rviz'))
    )

    return LaunchDescription([
        start_rviz_arg,
        start_manual_drive_arg,
        robot_launch,
        odom_node,
        lidar_launch,
        imu_node,
        slam_launch,
        manual_radio_drive_launch,
        rviz_node
    ])
