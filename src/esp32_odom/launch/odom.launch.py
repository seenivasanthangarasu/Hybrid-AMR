from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    params_file_arg = DeclareLaunchArgument(
        'params_file',
        default_value=PathJoinSubstitution([
            FindPackageShare('esp32_odom'),
            'config',
            'esp32_odom_params.yaml'
        ]),
        description='Full path to parameter YAML file for esp32_odom node'
    )

    odom_node = Node(
        package='esp32_odom',
        executable='odom_node',
        name='esp32_odom',
        output='screen',
        parameters=[LaunchConfiguration('params_file')]
    )

    return LaunchDescription([
        params_file_arg,
        odom_node
    ])
