import os
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
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
                'ch1_deadband_us': 160.0,
                'ch1_invert': False,
                'ch2_min_us': 880.0,
                'ch2_neutral_us': 1498.0,
                'ch2_max_us': 2045.0,
                'ch2_deadband_us': 160.0,
                'ch2_invert': False,
                'filter_alpha': 0.10,
                'max_linear_speed': 1.0,
                'max_angular_speed': 1.8,
                'signal_timeout_sec': 0.35,
                'publish_rate_hz': 50.0,
                'cmd_vel_topic': '/cmd_vel',
                'enable_cmd_vel_pub': True
            }]
        )
    ])
