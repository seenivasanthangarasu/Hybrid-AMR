from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='web_video_server',
            executable='web_video_server',
            name='web_video_server',
            output='screen',
            parameters=[{
                'port': 8082,
                'address': '0.0.0.0',
                'server_threads': 4,
                'ros_threads': 2,
                'default_transport': 'raw',
            }]
        )
    ])
