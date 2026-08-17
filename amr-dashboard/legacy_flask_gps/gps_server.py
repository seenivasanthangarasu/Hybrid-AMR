#!/usr/bin/env python3

from flask import Flask, jsonify
from flask_cors import CORS

import threading

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix

app = Flask(__name__)
CORS(app)

gps_data = {
    "lat": 0.0,
    "lon": 0.0,
    "status": "NO_FIX"
}


class GPSNode(Node):

    def __init__(self):

        super().__init__('gps_web_node')

        self.create_subscription(
            NavSatFix,
            '/fix',
            self.gps_callback,
            10
        )

        self.get_logger().info("GPS Web Server Started")

    def gps_callback(self, msg):

        gps_data["lat"] = msg.latitude
        gps_data["lon"] = msg.longitude

        if msg.status.status >= 0:
            gps_data["status"] = "FIX"
        else:
            gps_data["status"] = "NO_FIX"

        print(
            f"GPS => "
            f"{msg.latitude:.7f}, "
            f"{msg.longitude:.7f}"
        )


@app.route("/gps")
def gps():

    return jsonify(gps_data)


@app.route("/")
def home():

    return jsonify({
        "server": "running",
        "gps": gps_data
    })


def ros_spin():

    rclpy.init()

    node = GPSNode()

    rclpy.spin(node)

    node.destroy_node()

    rclpy.shutdown()


if __name__ == "__main__":

    ros_thread = threading.Thread(
        target=ros_spin,
        daemon=True
    )

    ros_thread.start()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
