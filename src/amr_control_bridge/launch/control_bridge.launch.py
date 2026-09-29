from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    robot_id_arg = DeclareLaunchArgument(
        'robot_id',
        default_value='',
        description='Robot identifier (default: derived from system identity)'
    )

    environment_arg = DeclareLaunchArgument(
        'environment',
        default_value='indoor',
        description='Operating environment (indoor | outdoor)'
    )

    navigation_ready_arg = DeclareLaunchArgument(
        'navigation_ready',
        default_value='true',
        description='Whether navigation stack is ready'
    )

    publish_session_arg = DeclareLaunchArgument(
        'publish_session_topic',
        default_value='true',
        description='Whether to publish /amr/session'
    )

    bridge_node = Node(
        package='amr_control_bridge',
        executable='amr_control_bridge_node',
        name='amr_control_bridge_node',
        output='screen',
        parameters=[{
            'robot_id': LaunchConfiguration('robot_id'),
            'environment': LaunchConfiguration('environment'),
            'navigation_ready': LaunchConfiguration('navigation_ready'),
            'publish_session_topic': LaunchConfiguration('publish_session_topic'),
        }]
    )

    return LaunchDescription([
        robot_id_arg,
        environment_arg,
        navigation_ready_arg,
        publish_session_arg,
        bridge_node,
    ])
