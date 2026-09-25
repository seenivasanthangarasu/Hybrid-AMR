#!/usr/bin/env python3
"""
Outdoor GPS Autonomous Navigation Node for Hybrid-AMR.
Integrates Hiwonder GPS, Hiwonder 9-DOF IMU, ESP32 Odometry, and YDLiDAR G4.
Includes Geodetic ENU transforms, obstacle safety, state machine, and RViz2 visualization.
"""

import sys
import time
import math
import threading
from typing import Optional, Tuple

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, qos_profile_sensor_data

from geometry_msgs.msg import Twist, PoseStamped, Point, Quaternion
from sensor_msgs.msg import NavSatFix, NavSatStatus, Imu, LaserScan
from nav_msgs.msg import Odometry, Path
from std_msgs.msg import String, Header
from visualization_msgs.msg import Marker, MarkerArray

from outdoor_navigation.geodesy import (
    validate_coordinates,
    haversine_distance,
    initial_bearing,
    geodetic_to_enu,
    normalize_angle_rad,
    normalize_angle_deg,
    enu_yaw_to_compass
)
from outdoor_navigation.state_machine import NavState, NavigationStateMachine


class OutdoorNavigationNode(Node):

    def __init__(self):
        super().__init__('outdoor_navigation_node')

        # ----------------------------------------------------------------------
        # Parameter Declarations
        # ----------------------------------------------------------------------
        self.declare_parameter('gps_topic', '/hiwonder/gps/fix')
        self.declare_parameter('imu_topic', '/hiwonder/imu/data_raw')
        self.declare_parameter('odom_topic', '/odom')
        self.declare_parameter('scan_topic', '/scan')
        self.declare_parameter('cmd_vel_out_topic', '/cmd_vel')
        self.declare_parameter('radio_cmd_vel_topic', '/radio/cmd_vel')

        self.declare_parameter('global_frame', 'odom')
        self.declare_parameter('base_frame', 'base_link')

        # Velocity and Control Limits
        self.declare_parameter('max_linear_speed', 0.35)    # m/s
        self.declare_parameter('min_linear_speed', 0.08)    # m/s
        self.declare_parameter('max_angular_speed', 0.60)   # rad/s
        self.declare_parameter('goal_tolerance', 1.50)      # meters
        self.declare_parameter('slow_down_distance', 4.00)  # meters
        self.declare_parameter('heading_tolerance', 0.45)   # rad (~25.8 deg)
        self.declare_parameter('heading_kp', 1.20)
        self.declare_parameter('linear_kp', 0.40)
        self.declare_parameter('max_linear_accel', 0.40)    # m/s^2
        self.declare_parameter('max_angular_accel', 0.80)   # rad/s^2

        # Safety & Timeouts
        self.declare_parameter('obstacle_stop_distance', 0.65) # meters
        self.declare_parameter('obstacle_slow_distance', 1.30) # meters
        self.declare_parameter('obstacle_corridor_width', 0.50)# meters
        self.declare_parameter('gps_timeout', 2.5)             # seconds
        self.declare_parameter('control_rate_hz', 20.0)        # Hz

        # Initial Destination (Optional Parameter Input)
        self.declare_parameter('destination_latitude', 0.0)
        self.declare_parameter('destination_longitude', 0.0)
        self.declare_parameter('interactive_input', True)

        # ----------------------------------------------------------------------
        # Fetch Parameter Values
        # ----------------------------------------------------------------------
        self.gps_topic = self.get_parameter('gps_topic').value
        self.imu_topic = self.get_parameter('imu_topic').value
        self.odom_topic = self.get_parameter('odom_topic').value
        self.scan_topic = self.get_parameter('scan_topic').value
        self.cmd_vel_out_topic = self.get_parameter('cmd_vel_out_topic').value
        self.radio_cmd_vel_topic = self.get_parameter('radio_cmd_vel_topic').value

        self.global_frame = self.get_parameter('global_frame').value
        self.base_frame = self.get_parameter('base_frame').value

        self.max_lin = float(self.get_parameter('max_linear_speed').value)
        self.min_lin = float(self.get_parameter('min_linear_speed').value)
        self.max_ang = float(self.get_parameter('max_angular_speed').value)
        self.goal_tol = float(self.get_parameter('goal_tolerance').value)
        self.slow_dist = float(self.get_parameter('slow_down_distance').value)
        self.heading_tol = float(self.get_parameter('heading_tolerance').value)
        self.heading_kp = float(self.get_parameter('heading_kp').value)
        self.linear_kp = float(self.get_parameter('linear_kp').value)
        self.max_lin_accel = float(self.get_parameter('max_linear_accel').value)
        self.max_ang_accel = float(self.get_parameter('max_angular_accel').value)

        self.obs_stop_dist = float(self.get_parameter('obstacle_stop_distance').value)
        self.obs_slow_dist = float(self.get_parameter('obstacle_slow_distance').value)
        self.obs_corridor = float(self.get_parameter('obstacle_corridor_width').value)
        self.gps_timeout = float(self.get_parameter('gps_timeout').value)
        self.control_rate = float(self.get_parameter('control_rate_hz').value)

        param_lat = float(self.get_parameter('destination_latitude').value)
        param_lon = float(self.get_parameter('destination_longitude').value)
        self.interactive_input_enabled = bool(self.get_parameter('interactive_input').value)

        # ----------------------------------------------------------------------
        # State Machine & Synchronization
        # ----------------------------------------------------------------------
        self.lock = threading.Lock()
        self.sm = NavigationStateMachine(logger=self.get_logger())
        self.sm.transition_to(NavState.WAITING_FOR_GPS, "System initialized. Waiting for real GPS fix.")

        # ----------------------------------------------------------------------
        # Sensor & Telemetry State
        # ----------------------------------------------------------------------
        self.current_lat: Optional[float] = None
        self.current_lon: Optional[float] = None
        self.current_alt: Optional[float] = None
        self.current_hdop: Optional[float] = None
        self.last_gps_time: float = 0.0
        self.gps_fix_valid: bool = False

        # Datum Origin for Local ENU
        self.datum_lat: Optional[float] = None
        self.datum_lon: Optional[float] = None

        # Destination Coordinates
        self.dest_lat: Optional[float] = None
        self.dest_lon: Optional[float] = None
        self.dest_enu: Optional[Tuple[float, float]] = None

        # Robot Orientation & Pose
        self.robot_heading_enu: float = 0.0 # rad (0 = East, pi/2 = North)
        self.robot_heading_valid: bool = False
        self.robot_enu_x: float = 0.0
        self.robot_enu_y: float = 0.0

        # Odometry fallback & delta integration
        self.odom_x: float = 0.0
        self.odom_y: float = 0.0
        self.odom_yaw: float = 0.0
        self.last_odom_time: float = 0.0

        # LiDAR Obstacle State
        self.min_forward_obstacle_dist: float = float('inf')
        self.obstacle_in_stop_zone: bool = False
        self.obstacle_in_slow_zone: bool = False
        self.last_scan_time: float = 0.0

        # Velocity commands & smoothing (slew rate)
        self.current_cmd_v: float = 0.0
        self.current_cmd_w: float = 0.0
        self.last_control_time: float = time.time()

        # Manual Override Telemetry
        self.last_radio_cmd_time: float = 0.0
        self.manual_override_active: bool = False

        # Visual Trajectory Buffers
        self.trajectory_path = Path()
        self.trajectory_path.header.frame_id = self.global_frame
        self.last_traj_record_pos = (0.0, 0.0)

        # ----------------------------------------------------------------------
        # ROS 2 Subscribers
        # ----------------------------------------------------------------------
        # 1. GPS Fix (/hiwonder/gps/fix)
        self.sub_gps = self.create_subscription(
            NavSatFix,
            self.gps_topic,
            self._gps_callback,
            10
        )

        # 2. IMU (/hiwonder/imu/data_raw)
        self.sub_imu = self.create_subscription(
            Imu,
            self.imu_topic,
            self._imu_callback,
            10
        )

        # 3. Odometry (/odom)
        self.sub_odom = self.create_subscription(
            Odometry,
            self.odom_topic,
            self._odom_callback,
            10
        )

        # 4. YDLiDAR G4 (/scan) - with Best Effort SensorDataQoS
        self.sub_scan = self.create_subscription(
            LaserScan,
            self.scan_topic,
            self._scan_callback,
            qos_profile_sensor_data
        )

        # 5. Radio Receiver Teleop (/radio/cmd_vel) for Manual Override
        self.sub_radio = self.create_subscription(
            Twist,
            self.radio_cmd_vel_topic,
            self._radio_callback,
            10
        )

        # 6. Dynamic Goal Setting (/outdoor_nav/set_gps_goal)
        self.sub_goal_gps = self.create_subscription(
            NavSatFix,
            '/outdoor_nav/set_gps_goal',
            self._set_gps_goal_callback,
            10
        )

        # ----------------------------------------------------------------------
        # ROS 2 Publishers
        # ----------------------------------------------------------------------
        self.pub_cmd_vel = self.create_publisher(Twist, self.cmd_vel_out_topic, 10)
        self.pub_state = self.create_publisher(String, '/outdoor_nav/state', 10)
        self.pub_current_pose = self.create_publisher(PoseStamped, '/outdoor_nav/current_pose', 10)
        self.pub_goal_pose = self.create_publisher(PoseStamped, '/outdoor_nav/goal_pose', 10)
        self.pub_global_path = self.create_publisher(Path, '/outdoor_nav/global_path', 10)
        self.pub_trajectory = self.create_publisher(Path, '/outdoor_nav/trajectory', 10)
        self.pub_markers = self.create_publisher(MarkerArray, '/outdoor_nav/markers', 10)

        # ----------------------------------------------------------------------
        # Control Loop Timer (e.g. 20 Hz)
        # ----------------------------------------------------------------------
        timer_period = 1.0 / max(1.0, self.control_rate)
        self.control_timer = self.create_timer(timer_period, self._control_loop)

        # ----------------------------------------------------------------------
        # Apply Initial Parameter Goal if Provided
        # ----------------------------------------------------------------------
        is_valid_param, _ = validate_coordinates(param_lat, param_lon)
        if is_valid_param:
            self._set_destination(param_lat, param_lon, source="Parameter")

        # ----------------------------------------------------------------------
        # Interactive Input Thread (CLI Prompt)
        # ----------------------------------------------------------------------
        self.input_thread = None
        if self.interactive_input_enabled and not is_valid_param:
            self.input_thread = threading.Thread(target=self._interactive_input_worker, daemon=True)
            self.input_thread.start()

        self.get_logger().info("=" * 60)
        self.get_logger().info("Outdoor GPS Autonomous Navigation Node Initialized")
        self.get_logger().info(f"GPS Topic   : {self.gps_topic}")
        self.get_logger().info(f"IMU Topic   : {self.imu_topic}")
        self.get_logger().info(f"Scan Topic  : {self.scan_topic}")
        self.get_logger().info(f"Motor Topic : {self.cmd_vel_out_topic}")
        self.get_logger().info(f"Max Speed   : {self.max_lin:.2f} m/s | Angular: {self.max_ang:.2f} rad/s")
        self.get_logger().info(f"Goal Tol    : {self.goal_tol:.2f} m | Stop Dist: {self.obs_stop_dist:.2f} m")
        self.get_logger().info("=" * 60)

    # --------------------------------------------------------------------------
    # Interactive Input Worker (CLI Destination Entry)
    # --------------------------------------------------------------------------
    def _interactive_input_worker(self):
        """Allows interactive entry of destination latitude/longitude via terminal."""
        time.sleep(1.0)
        print("\n" + "=" * 60)
        print(">>> OUTDOOR NAVIGATION COORDINATE INPUT PROMPT <<<")
        print("Enter destination latitude and longitude to begin autonomous navigation.")
        print("Example: 12.9715987, 77.5945627")
        print("=" * 60 + "\n")

        while rclpy.ok():
            try:
                raw_lat_str = input("Enter destination latitude : ").strip()
                if not raw_lat_str:
                    continue

                raw_lon_str = input("Enter destination longitude: ").strip()
                if not raw_lon_str:
                    continue

                try:
                    lat_val = float(raw_lat_str)
                    lon_val = float(raw_lon_str)
                except ValueError:
                    print("\n[ERROR] Invalid number format. Please enter decimal numbers.\n")
                    continue

                valid, err_msg = validate_coordinates(lat_val, lon_val)
                if not valid:
                    print(f"\n[ERROR] Coordinate validation failed: {err_msg}\n")
                    continue

                with self.lock:
                    self._set_destination(lat_val, lon_val, source="Interactive Console")

                print(f"\n[SUCCESS] Goal Accepted -> Lat: {lat_val:.7f}, Lon: {lon_val:.7f}\n")
                break

            except (EOFError, KeyboardInterrupt):
                break
            except Exception as e:
                print(f"\n[ERROR] Input exception: {e}\n")

    def _set_destination(self, lat: float, lon: float, source: str = "External"):
        """Validates and sets active destination coordinates."""
        valid, err = validate_coordinates(lat, lon)
        if not valid:
            self.get_logger().error(f"Cannot set invalid destination ({lat}, {lon}): {err}")
            return False

        self.dest_lat = lat
        self.dest_lon = lon

        # Compute ENU goal coordinates if datum is established
        if self.datum_lat is not None and self.datum_lon is not None:
            gx, gy = geodetic_to_enu(self.dest_lat, self.dest_lon, self.datum_lat, self.datum_lon)
            self.dest_enu = (gx, gy)
            self._publish_rviz_goal_and_path()

        self.get_logger().info(
            f"GOAL ACCEPTED ({source}): Latitude={lat:.7f}, Longitude={lon:.7f}"
        )

        # Update state machine transition if currently waiting for goal
        if self.sm.state == NavState.WAITING_FOR_VALID_GOAL:
            if self.gps_fix_valid:
                self.sm.transition_to(NavState.NAVIGATING, "Valid goal received and GPS fix active.")
            else:
                self.sm.transition_to(NavState.WAITING_FOR_GPS, "Goal accepted. Waiting for real GPS fix.")

        return True

    def _set_gps_goal_callback(self, msg: NavSatFix):
        """Callback for setting destination via ROS 2 topic."""
        self._set_destination(msg.latitude, msg.longitude, source="Topic /outdoor_nav/set_gps_goal")

    # --------------------------------------------------------------------------
    # GPS Callback
    # --------------------------------------------------------------------------
    def _gps_callback(self, msg: NavSatFix):
        now = time.time()
        lat = msg.latitude
        lon = msg.longitude
        alt = msg.altitude

        # Extract approximate HDOP from covariance if populated
        hdop = 0.0
        if msg.position_covariance_type != NavSatFix.COVARIANCE_TYPE_UNKNOWN:
            var = msg.position_covariance[0]
            if var > 0:
                hdop = math.sqrt(var) / 2.5

        # Check fix validity: status >= STATUS_FIX, not NaN, not (0,0)
        is_fix = (msg.status.status >= NavSatStatus.STATUS_FIX) and not (math.isnan(lat) or math.isnan(lon))
        is_nonzero = (abs(lat) > 1e-6 and abs(lon) > 1e-6)

        with self.lock:
            self.last_gps_time = now
            if is_fix and is_nonzero:
                self.gps_fix_valid = True
                self.current_lat = lat
                self.current_lon = lon
                self.current_alt = alt
                self.current_hdop = hdop

                # Initialize Datum Origin on first valid fix
                if self.datum_lat is None or self.datum_lon is None:
                    self.datum_lat = lat
                    self.datum_lon = lon
                    self.get_logger().info(
                        f"DATUM ORIGIN ANCHORED: Lat={lat:.7f}, Lon={lon:.7f}, Alt={alt:.2f}m"
                    )
                    # Recompute goal ENU if goal was set before first GPS fix
                    if self.dest_lat is not None and self.dest_lon is not None:
                        gx, gy = geodetic_to_enu(self.dest_lat, self.dest_lon, self.datum_lat, self.datum_lon)
                        self.dest_enu = (gx, gy)
                        self._publish_rviz_goal_and_path()

                # Update current ENU position
                self.robot_enu_x, self.robot_enu_y = geodetic_to_enu(
                    lat, lon, self.datum_lat, self.datum_lon
                )
                self._record_trajectory_point(self.robot_enu_x, self.robot_enu_y)

            else:
                self.gps_fix_valid = False

    # --------------------------------------------------------------------------
    # IMU Callback
    # --------------------------------------------------------------------------
    def _imu_callback(self, msg: Imu):
        qx = msg.orientation.x
        qy = msg.orientation.y
        qz = msg.orientation.z
        qw = msg.orientation.w

        # Validate quaternion norm
        norm_sq = qx*qx + qy*qy + qz*qz + qw*qw
        if norm_sq < 0.5:
            return

        # Yaw in ROS ENU: atan2(2*(w*z + x*y), 1 - 2*(y^2 + z^2))
        siny_cosp = 2.0 * (qw * qz + qx * qy)
        cosy_cosp = 1.0 - 2.0 * (qy * qy + qz * qz)
        yaw_rad = math.atan2(siny_cosp, cosy_cosp)

        with self.lock:
            self.robot_heading_enu = normalize_angle_rad(yaw_rad)
            self.robot_heading_valid = True

    # --------------------------------------------------------------------------
    # Odometry Callback
    # --------------------------------------------------------------------------
    def _odom_callback(self, msg: Odometry):
        with self.lock:
            self.last_odom_time = time.time()
            self.odom_x = msg.pose.pose.position.x
            self.odom_y = msg.pose.pose.position.y
            qz = msg.pose.pose.orientation.z
            qw = msg.pose.pose.orientation.w
            self.odom_yaw = math.atan2(2.0 * (qw * qz), 1.0 - 2.0 * (qz * qz))

    # --------------------------------------------------------------------------
    # LiDAR Safety Callback
    # --------------------------------------------------------------------------
    def _scan_callback(self, msg: LaserScan):
        now = time.time()
        num_ranges = len(msg.ranges)
        if num_ranges == 0:
            return

        angle_min = msg.angle_min
        angle_inc = msg.angle_increment
        range_min = msg.range_min
        range_max = msg.range_max

        min_fwd_dist = float('inf')
        half_corridor = self.obs_corridor / 2.0

        for i, r in enumerate(msg.ranges):
            if math.isnan(r) or math.isinf(r) or r < range_min or r > range_max:
                continue

            angle = angle_min + i * angle_inc
            # Convert ray polar (r, angle) to robot-relative Cartesian (x_front, y_side)
            # Standard LiDAR mount: angle 0 rad = forward (+X)
            x = r * math.cos(angle)
            y = r * math.sin(angle)

            # Check forward bounding box
            if 0.05 < x < self.obs_slow_dist and abs(y) <= half_corridor:
                if x < min_fwd_dist:
                    min_fwd_dist = x

        with self.lock:
            self.last_scan_time = now
            self.min_forward_obstacle_dist = min_fwd_dist
            self.obstacle_in_stop_zone = (min_fwd_dist <= self.obs_stop_dist)
            self.obstacle_in_slow_zone = (self.obs_stop_dist < min_fwd_dist <= self.obs_slow_dist)

    # --------------------------------------------------------------------------
    # Manual Radio Override Callback
    # --------------------------------------------------------------------------
    def _radio_callback(self, msg: Twist):
        # If radio receiver produces non-zero joystick input, detect manual override
        if abs(msg.linear.x) > 0.02 or abs(msg.angular.z) > 0.03:
            with self.lock:
                self.last_radio_cmd_time = time.time()
                self.manual_override_active = True

    # --------------------------------------------------------------------------
    # Main Control & State Machine Loop (20 Hz)
    # --------------------------------------------------------------------------
    def _control_loop(self):
        now = time.time()
        dt = now - self.last_control_time
        self.last_control_time = now
        if dt <= 0.0 or dt > 0.5:
            dt = 0.05

        with self.lock:
            gps_valid = self.gps_fix_valid
            gps_age = now - self.last_gps_time
            curr_lat = self.current_lat
            curr_lon = self.current_lon
            dest_lat = self.dest_lat
            dest_lon = self.dest_lon
            robot_yaw = self.robot_heading_enu
            heading_valid = self.robot_heading_valid
            obs_stop = self.obstacle_in_stop_zone
            obs_slow = self.obstacle_in_slow_zone
            obs_min_d = self.min_forward_obstacle_dist
            manual_age = now - self.last_radio_cmd_time
            manual_active = (manual_age < 0.5)

        # ----------------------------------------------------------------------
        # 1. State Machine Transitions & Safety Checks
        # ----------------------------------------------------------------------
        # Check Manual Radio Override Priority
        if manual_active:
            if self.sm.state == NavState.NAVIGATING:
                self.sm.transition_to(NavState.STOPPED, "Manual radio teleop active - yielding to operator.")
            self._publish_state()
            return

        # Check GPS Validity & Timeout
        if not gps_valid or (gps_age > self.gps_timeout and self.last_gps_time > 0):
            if self.sm.state == NavState.NAVIGATING:
                self.sm.transition_to(NavState.GPS_LOST, f"GPS fix lost or timed out ({gps_age:.1f}s > {self.gps_timeout}s).")
                self._stop_motors()
            elif self.sm.state not in (NavState.WAITING_FOR_GPS, NavState.GPS_LOST, NavState.ERROR):
                self.sm.transition_to(NavState.WAITING_FOR_GPS, "Waiting for real GPS fix.")
        else:
            # GPS is valid
            if self.sm.state in (NavState.WAITING_FOR_GPS, NavState.GPS_LOST):
                if dest_lat is not None and dest_lon is not None:
                    self.sm.transition_to(NavState.NAVIGATING, "GPS fix acquired and destination set.")
                else:
                    self.sm.transition_to(NavState.WAITING_FOR_VALID_GOAL, "GPS fix acquired. Waiting for destination.")

        # Check Goal Presence
        if self.sm.state == NavState.WAITING_FOR_VALID_GOAL:
            if dest_lat is not None and dest_lon is not None and gps_valid:
                self.sm.transition_to(NavState.NAVIGATING, "Valid destination entered.")

        # Check Obstacle Safety
        if self.sm.state == NavState.NAVIGATING and obs_stop:
            self.sm.transition_to(NavState.OBSTACLE_STOP, f"Obstacle in safety corridor ({obs_min_d:.2f}m <= {self.obs_stop_dist:.2f}m).")
            self._stop_motors()
        elif self.sm.state == NavState.OBSTACLE_STOP:
            if not obs_stop:
                self.sm.transition_to(NavState.NAVIGATING, "Obstacle cleared safety corridor.")
            else:
                self._stop_motors()

        # ----------------------------------------------------------------------
        # 2. Autonomous Navigation Controller
        # ----------------------------------------------------------------------
        if self.sm.is_autonomous_motion_allowed():
            # Validate coordinates are present
            if curr_lat is None or curr_lon is None or dest_lat is None or dest_lon is None:
                self._stop_motors()
                self._publish_state()
                return

            # Compute Geodesic Distance & Bearing
            dist_to_goal = haversine_distance(curr_lat, curr_lon, dest_lat, dest_lon)
            compass_bearing_deg = initial_bearing(curr_lat, curr_lon, dest_lat, dest_lon)

            # Compute ENU target angle (0 = East, pi/2 = North)
            # compass_bearing: 0=N, 90=E -> ENU = 90 - compass_bearing
            target_enu_rad = math.radians(90.0 - compass_bearing_deg)
            target_enu_rad = normalize_angle_rad(target_enu_rad)

            # Compute Heading Error
            heading_error_rad = normalize_angle_rad(target_enu_rad - robot_yaw)
            heading_error_deg = math.degrees(heading_error_rad)

            # ------------------------------------------------------------------
            # Check Goal Arrival
            # ------------------------------------------------------------------
            if dist_to_goal <= self.goal_tol:
                self.sm.transition_to(
                    NavState.GOAL_REACHED,
                    f"GOAL REACHED! Final distance: {dist_to_goal:.2f}m <= {self.goal_tol:.2f}m."
                )
                self.get_logger().info("=" * 60)
                self.get_logger().info(f"*** GOAL REACHED (Distance = {dist_to_goal:.2f} m) ***")
                self.get_logger().info("=" * 60)
                self._stop_motors()
                self._publish_state()
                self._publish_visualizations(dist_to_goal, compass_bearing_deg, heading_error_deg)
                return

            # ------------------------------------------------------------------
            # Compute Velocity Commands
            # ------------------------------------------------------------------
            # Angular Control (Proportional with heading error)
            cmd_w = self.heading_kp * heading_error_rad
            cmd_w = max(-self.max_ang, min(self.max_ang, cmd_w))

            # Linear Control
            # Phase 1: Turn-in-place if heading error exceeds threshold
            if abs(heading_error_rad) > self.heading_tol:
                cmd_v = 0.0
            else:
                # Phase 2: Drive forward and steer simultaneously
                # Decelerate when approaching goal
                if dist_to_goal < self.slow_dist:
                    speed_scale = max(0.2, dist_to_goal / self.slow_dist)
                    base_v = self.max_lin * speed_scale
                else:
                    base_v = self.max_lin

                # Cosine alignment scaling
                alignment_factor = max(0.0, math.cos(heading_error_rad))
                cmd_v = base_v * alignment_factor
                cmd_v = max(self.min_lin, min(self.max_lin, cmd_v))

                # Scale speed down if in obstacle slow zone
                if obs_slow and self.obs_slow_dist > self.obs_stop_dist:
                    obs_factor = (obs_min_d - self.obs_stop_dist) / (self.obs_slow_dist - self.obs_stop_dist)
                    obs_factor = max(0.2, min(1.0, obs_factor))
                    cmd_v *= obs_factor

            # Apply Slew Rate Acceleration Limiting
            max_v_step = self.max_lin_accel * dt
            max_w_step = self.max_ang_accel * dt

            target_v = max(self.current_cmd_v - max_v_step, min(self.current_cmd_v + max_v_step, cmd_v))
            target_w = max(self.current_cmd_w - max_w_step, min(self.current_cmd_w + max_w_step, cmd_w))

            self.current_cmd_v = target_v
            self.current_cmd_w = target_w

            # Publish to /cmd_vel
            twist = Twist()
            twist.linear.x = float(target_v)
            twist.angular.z = float(target_w)
            self.pub_cmd_vel.publish(twist)

            # Throttled Telemetry Logging
            self.get_logger().info(
                f"NAVIGATING | Dist: {dist_to_goal:.1f}m | Bearing: {compass_bearing_deg:.1f}° | "
                f"Heading: {enu_yaw_to_compass(robot_yaw):.1f}° | Err: {heading_error_deg:+.1f}° | "
                f"Cmd: [v={target_v:.2f} m/s, w={target_w:.2f} rad/s]",
                throttle_duration_sec=2.0
            )

            self._publish_visualizations(dist_to_goal, compass_bearing_deg, heading_error_deg)

        else:
            # Not in NAVIGATING state -> enforce zero velocity
            self._stop_motors()
            # Throttled State Log
            if self.sm.state == NavState.WAITING_FOR_GPS:
                self.get_logger().info(
                    "WAITING FOR GPS FIX - Autonomous movement inhibited.",
                    throttle_duration_sec=5.0
                )
            elif self.sm.state == NavState.WAITING_FOR_VALID_GOAL:
                self.get_logger().info(
                    "WAITING FOR DESTINATION - Real GPS fix is valid. Awaiting coordinates.",
                    throttle_duration_sec=5.0
                )

        self._publish_state()

    def _stop_motors(self):
        """Sends safe zero velocity command."""
        self.current_cmd_v = 0.0
        self.current_cmd_w = 0.0
        twist = Twist()
        twist.linear.x = 0.0
        twist.angular.z = 0.0
        self.pub_cmd_vel.publish(twist)

    def _publish_state(self):
        """Publishes current state string."""
        msg = String()
        msg.data = f"{self.sm.state_str}: {self.sm.state_reason}"
        self.pub_state.publish(msg)

    # --------------------------------------------------------------------------
    # RViz2 Visualizations
    # --------------------------------------------------------------------------
    def _record_trajectory_point(self, x: float, y: float):
        """Appends current ENU point to trajectory path if moved > 0.2m."""
        dx = x - self.last_traj_record_pos[0]
        dy = y - self.last_traj_record_pos[1]
        if math.hypot(dx, dy) > 0.20:
            self.last_traj_record_pos = (x, y)
            pose = PoseStamped()
            pose.header.stamp = self.get_clock().now().to_msg()
            pose.header.frame_id = self.global_frame
            pose.pose.position.x = float(x)
            pose.pose.position.y = float(y)
            pose.pose.position.z = 0.0
            self.trajectory_path.poses.append(pose)
            self.trajectory_path.header.stamp = pose.header.stamp
            self.pub_trajectory.publish(self.trajectory_path)

    def _publish_rviz_goal_and_path(self):
        """Publishes goal pose and planned global line path."""
        if self.dest_enu is None:
            return

        gx, gy = self.dest_enu
        stamp = self.get_clock().now().to_msg()

        # Goal Pose
        gp = PoseStamped()
        gp.header.stamp = stamp
        gp.header.frame_id = self.global_frame
        gp.pose.position.x = float(gx)
        gp.pose.position.y = float(gy)
        gp.pose.position.z = 0.0
        gp.pose.orientation.w = 1.0
        self.pub_goal_pose.publish(gp)

        # Global Path from robot to goal
        path = Path()
        path.header.stamp = stamp
        path.header.frame_id = self.global_frame

        p_start = PoseStamped()
        p_start.header = gp.header
        p_start.pose.position.x = float(self.robot_enu_x)
        p_start.pose.position.y = float(self.robot_enu_y)
        p_start.pose.orientation.w = 1.0

        p_goal = PoseStamped()
        p_goal.header = gp.header
        p_goal.pose.position.x = float(gx)
        p_goal.pose.position.y = float(gy)
        p_goal.pose.orientation.w = 1.0

        path.poses = [p_start, p_goal]
        self.pub_global_path.publish(path)

    def _publish_visualizations(self, dist_to_goal: float, bearing_deg: float, heading_err_deg: float):
        """Publishes RViz PoseStamped and MarkerArray for destination, heading arrow, and clearance."""
        stamp = self.get_clock().now().to_msg()

        # 1. Current Robot Pose (ENU)
        cp = PoseStamped()
        cp.header.stamp = stamp
        cp.header.frame_id = self.global_frame
        cp.pose.position.x = float(self.robot_enu_x)
        cp.pose.position.y = float(self.robot_enu_y)
        cp.pose.position.z = 0.0
        half_yaw = self.robot_heading_enu * 0.5
        cp.pose.orientation.z = math.sin(half_yaw)
        cp.pose.orientation.w = math.cos(half_yaw)
        self.pub_current_pose.publish(cp)

        # 2. Visualization Markers
        markers = MarkerArray()

        # Marker 1: Destination Goal Cylinder / Pillar
        if self.dest_enu is not None:
            gx, gy = self.dest_enu
            m_goal = Marker()
            m_goal.header.stamp = stamp
            m_goal.header.frame_id = self.global_frame
            m_goal.ns = "goal_marker"
            m_goal.id = 0
            m_goal.type = Marker.CYLINDER
            m_goal.action = Marker.ADD
            m_goal.pose.position.x = float(gx)
            m_goal.pose.position.y = float(gy)
            m_goal.pose.position.z = 0.5
            m_goal.pose.orientation.w = 1.0
            m_goal.scale.x = 0.8
            m_goal.scale.y = 0.8
            m_goal.scale.z = 1.0
            m_goal.color.r = 0.0
            m_goal.color.g = 1.0
            m_goal.color.b = 0.2
            m_goal.color.a = 0.8
            markers.markers.append(m_goal)

            # Marker 2: Text Annotation over Goal
            m_text = Marker()
            m_text.header.stamp = stamp
            m_text.header.frame_id = self.global_frame
            m_text.ns = "goal_text"
            m_text.id = 1
            m_text.type = Marker.TEXT_VIEW_FACING
            m_text.action = Marker.ADD
            m_text.pose.position.x = float(gx)
            m_text.pose.position.y = float(gy)
            m_text.pose.position.z = 1.3
            m_text.scale.z = 0.4
            m_text.color.r = 1.0
            m_text.color.g = 1.0
            m_text.color.b = 1.0
            m_text.color.a = 1.0
            m_text.text = f"GOAL: {dist_to_goal:.1f}m"
            markers.markers.append(m_text)

        # Marker 3: Target Heading Vector Arrow
        m_arrow = Marker()
        m_arrow.header.stamp = stamp
        m_arrow.header.frame_id = self.global_frame
        m_arrow.ns = "bearing_arrow"
        m_arrow.id = 2
        m_arrow.type = Marker.ARROW
        m_arrow.action = Marker.ADD
        p1 = Point(x=float(self.robot_enu_x), y=float(self.robot_enu_y), z=0.1)
        # Vector pointing towards goal bearing
        target_enu_rad = math.radians(90.0 - bearing_deg)
        arrow_len = min(2.5, max(1.0, dist_to_goal))
        p2 = Point(
            x=float(self.robot_enu_x + arrow_len * math.cos(target_enu_rad)),
            y=float(self.robot_enu_y + arrow_len * math.sin(target_enu_rad)),
            z=0.1
        )
        m_arrow.points = [p1, p2]
        m_arrow.scale.x = 0.08 # shaft diameter
        m_arrow.scale.y = 0.16 # head diameter
        m_arrow.scale.z = 0.20 # head length
        m_arrow.color.r = 1.0
        m_arrow.color.g = 0.8
        m_arrow.color.b = 0.0
        m_arrow.color.a = 0.9
        markers.markers.append(m_arrow)

        self.pub_markers.publish(markers)

    # --------------------------------------------------------------------------
    # Shutdown / Cleanup
    # --------------------------------------------------------------------------
    def destroy_node(self):
        self.get_logger().info("Outdoor Navigation Node shutting down - Sending STOP command.")
        self._stop_motors()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = OutdoorNavigationNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
        pass
    except Exception as e:
        if rclpy.ok():
            node.get_logger().error(f"Fatal error in Outdoor Navigation: {e}")
    finally:
        try:
            node.destroy_node()
        except Exception:
            pass
        if rclpy.ok():
            try:
                rclpy.shutdown()
            except Exception:
                pass


if __name__ == '__main__':
    main()
