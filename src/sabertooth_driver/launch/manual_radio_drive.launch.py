from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    """Combined launch file for full radio receiver + Sabertooth manual drive stack."""
    return LaunchDescription([
        # 1. Radio Receiver Node (HOT RC DS-600 on GPIO8 & GPIO24)
        Node(
            package='radio_receiver',
            executable='radio_receiver_node',
            name='radio_receiver_node',
            output='screen',
            parameters=[{
                'gpio_chip': 'gpiochip4',
                'ch1_gpio': 8,
                'ch2_gpio': 24,
                'ch1_min_us': 800.0,
                'ch1_neutral_us': 1494.0,
                'ch1_max_us': 2200.0,
                'ch1_deadband_us': 35.0,
                'ch1_invert': False,
                'ch2_min_us': 870.0,
                'ch2_neutral_us': 1904.0,
                'ch2_max_us': 2200.0,
                'ch2_deadband_us': 35.0,
                'ch2_invert': False,
                'max_linear_speed': 1.0,
                'max_angular_speed': 1.8,
                'signal_timeout_sec': 0.35,
                'publish_rate_hz': 50.0,
                'cmd_vel_topic': '/cmd_vel',
                'enable_cmd_vel_pub': True
            }]
        ),

        # 2. Sabertooth 2x32 Motor Controller Node (/dev/sabertooth)
        Node(
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
            }]
        )
    ])
