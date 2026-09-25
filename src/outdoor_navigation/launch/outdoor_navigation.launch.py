from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
from ament_index_python.packages import get_package_share_directory
import os


def generate_launch_description():
    pkg_share = get_package_share_directory('outdoor_navigation')
    default_params_file = os.path.join(pkg_share, 'config', 'outdoor_navigation_params.yaml')
    default_rviz_file = os.path.join(pkg_share, 'rviz', 'outdoor_navigation.rviz')

    params_file_arg = DeclareLaunchArgument(
        'params_file',
        default_value=default_params_file,
        description='Full path to the ROS 2 parameters YAML file for outdoor navigation'
    )

    start_rviz_arg = DeclareLaunchArgument(
        'start_rviz',
        default_value='false',
        description='Whether to automatically start RViz2 visualization'
    )

    rviz_config_arg = DeclareLaunchArgument(
        'rviz_config',
        default_value=default_rviz_file,
        description='Full path to the RViz configuration file'
    )

    outdoor_nav_node = Node(
        package='outdoor_navigation',
        executable='outdoor_navigation_node',
        name='outdoor_navigation_node',
        output='screen',
        emulate_tty=True,
        parameters=[LaunchConfiguration('params_file')]
    )

    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        name='rviz2',
        output='screen',
        arguments=['-d', LaunchConfiguration('rviz_config')],
        condition=IfCondition(LaunchConfiguration('start_rviz'))
    )

    return LaunchDescription([
        params_file_arg,
        start_rviz_arg,
        rviz_config_arg,
        outdoor_nav_node,
        rviz_node
    ])
