import os
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, DeclareLaunchArgument
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    pkg_bringup = get_package_share_directory('rock_bringup')
    mapping_launch_file = os.path.join(pkg_bringup, 'launch', 'mapping.launch.py')

    start_rviz_arg = DeclareLaunchArgument(
        'start_rviz',
        default_value='false',
        description='Whether to start RViz2'
    )

    start_manual_drive_arg = DeclareLaunchArgument(
        'start_manual_drive',
        default_value='true',
        description='Whether to start Sabertooth manual radio drive stack for outdoor driving'
    )

    start_gps_arg = DeclareLaunchArgument(
        'start_gps',
        default_value='true',
        description='Whether to start Hiwonder GPS node for outdoor mapping telemetry'
    )

    mapping_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(mapping_launch_file),
        launch_arguments={
            'start_rviz': LaunchConfiguration('start_rviz'),
            'start_manual_drive': LaunchConfiguration('start_manual_drive'),
            'start_gps': LaunchConfiguration('start_gps'),
        }.items()
    )

    return LaunchDescription([
        start_rviz_arg,
        start_manual_drive_arg,
        start_gps_arg,
        mapping_launch
    ])
