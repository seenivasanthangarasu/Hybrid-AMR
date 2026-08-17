from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, Command, PathJoinSubstitution
from launch.conditions import IfCondition, UnlessCondition

from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():

    # ----------------------------
    # Package path
    # ----------------------------
    pkg_share = FindPackageShare('gogo_description')

    xacro_file = PathJoinSubstitution([
        pkg_share,
        'urdf',
        'gogo.xacro'
    ])

    rviz_config_file = PathJoinSubstitution([
        pkg_share,
        'config',
        'display.rviz'
    ])

    # ----------------------------
    # GUI argument
    # ----------------------------
    gui_arg = DeclareLaunchArgument(
        'gui',
        default_value='true'
    )

    gui = LaunchConfiguration('gui')

    # ----------------------------
    # Robot State Publisher
    # ----------------------------
    robot_state_publisher_node = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        output='screen',
        parameters=[{
            'robot_description': Command(['xacro ', xacro_file])
        }]
    )

    # ----------------------------
    # Joint State Publisher (no GUI)
    # ----------------------------
    joint_state_publisher_node = Node(
        condition=UnlessCondition(gui),
        package='joint_state_publisher',
        executable='joint_state_publisher',
        output='screen'
    )

    # ----------------------------
    # Joint State Publisher GUI
    # ----------------------------
    joint_state_publisher_gui_node = Node(
        condition=IfCondition(gui),
        package='joint_state_publisher_gui',
        executable='joint_state_publisher_gui',
        output='screen'
    )

    # ----------------------------
    # RViz2
    # ----------------------------
    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        output='screen',
        arguments=['-d', rviz_config_file]
    )

    return LaunchDescription([
        gui_arg,
        robot_state_publisher_node,
        joint_state_publisher_node,
        joint_state_publisher_gui_node,
        rviz_node
    ])
