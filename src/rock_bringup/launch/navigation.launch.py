from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch.launch_description_sources import PythonLaunchDescriptionSource

from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare

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

    start_manual_drive_arg = DeclareLaunchArgument(
        'start_manual_drive',
        default_value='true',
        description='Whether to start the Sabertooth manual radio drive stack (ros2 launch sabertooth_driver manual_radio_drive.launch.py)'
    )

    start_motors_arg = DeclareLaunchArgument(
        'start_motors',
        default_value='false',
        description='Whether to start the Sabertooth 2x32 motor driver node'
    )

    start_radio_arg = DeclareLaunchArgument(
        'start_radio',
        default_value='false',
        description='Whether to start the HOT RC DS-600 radio receiver teleop node'
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
    # Robot State Publisher & TF
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
    # ESP32 Tracked Odometry Node
    # -----------------------------
    odom_params_file = PathJoinSubstitution([
        FindPackageShare('esp32_odom'),
        'config',
        'esp32_odom_params.yaml'
    ])

    odom_node = Node(
        package='esp32_odom',
        executable='odom_node',
        name='esp32_odom',
        output='screen',
        parameters=[odom_params_file]
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
            'baudrate': 9600,
            'frame_id': 'imu_link'
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

    # -----------------------------
    # Sabertooth Manual Radio Drive (HOT RC Radio Receiver + Sabertooth Motor Driver)
    # -----------------------------
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

    # -----------------------------
    # Sabertooth 2x32 Motor Driver Node (Standalone)
    # -----------------------------
    sabertooth_node = Node(
        package='sabertooth_driver',
        executable='sabertooth_node',
        name='sabertooth_node',
        output='screen',
        parameters=[{
            'port': '/dev/sabertooth',
            'baudrate': 115200,
            'address': 128,
            'cmd_vel_topic': '/cmd_vel',
            'wheel_track': 0.35,
            'max_linear_speed': 1.0,
            'max_angular_speed': 1.8,
            'max_motor_power': 2047,
            'invert_left': False,
            'invert_right': False,
            'watchdog_timeout_sec': 0.25,
            'control_rate_hz': 50.0,
            'protocol': 'usb_describe'
        }],
        condition=IfCondition(LaunchConfiguration('start_motors'))
    )

    # -----------------------------
    # HOT RC DS-600 Radio Receiver Node (Standalone)
    # -----------------------------
    radio_node = Node(
        package='radio_receiver',
        executable='radio_receiver_node',
        name='radio_receiver_node',
        output='screen',
        parameters=[{
            'gpio_chip': 'gpiochip4',
            'ch1_gpio': 8,
            'ch2_gpio': 24,
            'ch1_min_us': 880.0,
            'ch1_neutral_us': 1498.0,
            'ch1_max_us': 2045.0,
            'ch1_deadband_us': 130.0,
            'ch1_invert': False,
            'ch2_min_us': 880.0,
            'ch2_neutral_us': 1498.0,
            'ch2_max_us': 2045.0,
            'ch2_deadband_us': 130.0,
            'ch2_invert': False,
            'filter_alpha': 0.10,
            'max_linear_speed': 1.0,
            'max_angular_speed': 1.8,
            'signal_timeout_sec': 0.35,
            'publish_rate_hz': 50.0,
            'cmd_vel_topic': '/cmd_vel',
            'enable_cmd_vel_pub': True
        }],
        condition=IfCondition(LaunchConfiguration('start_radio'))
    )

    return LaunchDescription([
        start_gps_arg,
        start_manual_drive_arg,
        start_motors_arg,
        start_radio_arg,
        start_camera_arg,
        start_rviz_arg,
        robot_launch,
        gps_node,
        lidar_launch,
        odom_node,
        imu_node,
        manual_radio_drive_launch,
        sabertooth_node,
        radio_node,
        slam_node,
        rviz_node,
        camera_launch
    ])
