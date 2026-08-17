/** Types barrel export — single entry point for all type definitions */

export * from './mission'
export type { Waypoint, MissionStatus, Mission } from './mission'

export * from './robot'
export type { BatteryInfo, RobotStateData, BatteryStatus, NavMode, LocalizationStatus, GpsFixType, RobotState } from './robot'

export * from './gps'
export type { SatelliteInfo, GpsFix } from './gps'

export * from './camera'
export type { CameraSource, CameraResolution } from './camera'

export * from './diagnostics'
export type { DiagnosticLevel, DiagnosticEntry } from './diagnostics'

// ROS2 message interfaces (re-exported for convenience)
export type { Odometry, LaserScan, PoseStamped, NavPlan, Twist, JointState, DiagnosticArray, DiagnosticStatus, BatteryState } from './ros2'
