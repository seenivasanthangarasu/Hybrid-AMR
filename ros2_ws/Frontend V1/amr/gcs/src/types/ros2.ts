/** ROS2 message type interfaces — used by roslbibjs for typed subscriptions */

export interface Odometry {
  header: { seq: number; stamp: number; frame_id: string }
  child_frame_id: string
  pose: {
    pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }
    covariance: number[]
  }
  twist: {
    twist: { linear: { x: number; y: number; z: number }; angular: { x: number; y: number; z: number } }
    covariance: number[]
  }
}

export interface LaserScan {
  header: { seq: number; stamp: number; frame_id: string }
  angle_min: number
  angle_max: number
  angle_increment: number
  scan_time: number
  range_min: number
  range_max: number
  ranges: number[]
  intensities: number[]
}

export interface PoseStamped {
  header: { seq: number; stamp: number; frame_id: string }
  pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }
}

export interface NavPlan {
  header: { seq: number; stamp: number; frame_id: string }
  poses: PoseStamped[]
}

export interface Twist {
  linear: { x: number; y: number; z: number }
  angular: { x: number; y: number; z: number }
}

export interface JointState {
  header: { seq: number; stamp: number; frame_id: string }
  name: string[]
  position: number[]
  velocity: number[]
  effort: number[]
}

/** Diagnostic array from /diagnostics topic */
export interface DiagnosticArray {
  header: { seq: number; stamp: number; frame_id: string }
  status: DiagnosticStatus[]
}

export interface DiagnosticStatus {
  name: string
  level: number     // 0=ok, 1=warn, 2=error, 3=fatal
  message: string
  values: Array<{ key: string; value: string }>
}

/** Battery state from /battery_state */
export interface BatteryState {
  header: { seq: number; stamp: number; frame_id: string }
  voltage: number
  percentage: number
  status: number    // 0=unknown, 1=charging, 2=discharging, 3=full
}
