from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
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
