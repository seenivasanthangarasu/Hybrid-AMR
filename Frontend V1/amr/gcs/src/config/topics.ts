/**
 * ALL ROS2 topic names — single source of truth.
 * Synced with the actual robot's running topics.
 * Never hardcode topic strings elsewhere in the codebase.
 */

export const TOPICS = {
  // ─── Subscribed (data FROM the robot) ───

  // Odometry — nav_msgs/msg/Odometry (from wheel encoder + IMU fusion)
  odom: '/odom',

  // GPS fix — sensor_msgs/msg/NavSatFix (from ublox_gps_node)
  fix: '/fix',

  // LiDAR scan — sensor_msgs/msg/LaserScan (from ydlidar_ros2_driver_node)
  scan: '/scan',

  // Occupancy map — nav_msgs/msg/OccupancyGrid (from slam_toolbox)
  map: '/map',

  // TF transforms — tf2_msgs/msg/TFMessage (robot frame tree)
  tf: '/tf',
  tfStatic: '/tf_static',

  // Joint states — sensor_msgs/msg/JointState (motor encoders + ESP32)
  jointStates: '/joint_states',

  // Diagnostics — diagnostic_msgs/msg/DiagnosticArray (roscore + all nodes)
  diagnostics: '/diagnostics',

  // Clock — builtin_interfaces/msg/Time (ROS clock sync)
  clock: '/clock',

  // ─── Published (commands TO the robot) ───

  // Velocity command — geometry_msgs/msg/Twist (to ESP32 motor controller)
  cmdVel: '/cmd_vel',

  // Navigation goal — geometry_msgs/msg/PoseStamped (to Nav2 /navigate_to_pose)
  goalPose: '/goal_pose',

  // ─── Not implemented yet (reserved for future modules) ───

  /** AMCL pose reset — geometry_msgs/msg/PoseWithCovarianceStamped */
  initialPose: '/initialpose',
  /** Clicked point for placing 2D goals in RViz/map — geometry_msgs/msg/PointStamped */
  clickedPoint: '/clicked_point',
} as const

export type TopicKey = keyof typeof TOPICS
export type TopicName = (typeof TOPICS)[TopicKey]

/** Validate that a string matches one of our known topics */
export function isValidTopic(topic: string): topic is TopicName {
  return Object.values(TOPICS).includes(topic as TopicName)
}
