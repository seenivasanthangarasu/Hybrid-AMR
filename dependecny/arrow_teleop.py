#!/usr/bin/env python3

import sys
import tty
import termios

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist


FORWARD_SPEED = 0.08
TURN_RATE = 0.6


class ArrowTeleop(Node):

    def __init__(self):
        super().__init__('arrow_teleop')

        self.pub = self.create_publisher(
            Twist,
            '/cmd_vel',
            10)

    def send(self, linear, angular):

        msg = Twist()

        msg.linear.x = linear
        msg.angular.z = angular

        self.pub.publish(msg)


def get_key():

    fd = sys.stdin.fileno()

    old_settings = termios.tcgetattr(fd)

    try:

        tty.setraw(fd)

        ch1 = sys.stdin.read(1)

        if ch1 == '\x1b':

            ch2 = sys.stdin.read(1)
            ch3 = sys.stdin.read(1)

            return ch1 + ch2 + ch3

        return ch1

    finally:

        termios.tcsetattr(
            fd,
            termios.TCSADRAIN,
            old_settings)


def main():

    rclpy.init()

    node = ArrowTeleop()

    print("")
    print("===================================")
    print(" AMR ARROW TELEOP")
    print("===================================")
    print("↑  Forward")
    print("↓  Reverse")
    print("←  Smooth Left Turn")
    print("→  Smooth Right Turn")
    print("SPACE = STOP")
    print("q = Quit")
    print("===================================")
    print("")

    try:

        while rclpy.ok():

            key = get_key()

            if key == '\x1b[A':

                node.send(
                    FORWARD_SPEED,
                    0.0)

            elif key == '\x1b[B':

                node.send(
                    -FORWARD_SPEED,
                    0.0)

            elif key == '\x1b[D':

                node.send(
                    FORWARD_SPEED,
                    TURN_RATE)

            elif key == '\x1b[C':

                node.send(
                    FORWARD_SPEED,
                    -TURN_RATE)

            elif key == ' ':

                node.send(
                    0.0,
                    0.0)

            elif key == 'q':

                break

    finally:

        node.send(
            0.0,
            0.0)

        node.destroy_node()

        rclpy.shutdown()


if __name__ == '__main__':
    main()
