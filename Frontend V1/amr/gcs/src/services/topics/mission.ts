/** Mission commands — mapped to Nav2-compatible ROS2 actions on this robot */
import { rosBridgeService } from '../ros/connection'

/** Nav2 uses /goal_pose for navigation goals. No custom mission topics exist.
 * START → publish first waypoint as PoseStamped to /goal_pose
 * PAUSE/RESUME → use zero velocity via /cmd_vel or Nav2 pause service
 * STOP → zero velocity on /cmd_vel
 */

export const MISSION_COMMANDS = {
  START: 'start' as const,
  PAUSE: 'pause' as const,
  RESUME: 'resume' as const,
  STOP: 'stop' as const,
}

/** Send Nav2 navigation goal (called internally by Mission Planner) */
export function sendNavGoal(x: number, y: number, z = 0, yaw = 0): void {
  const quaternion = eulerToQuaternion(0, 0, yaw)
  rosBridgeService.publish('/goal_pose', {
    header: { stamp: { sec: Math.floor(Date.now() / 1000), nanosec: 0 }, frame_id: 'map' },
    pose: { position: { x, y, z }, orientation: quaternion },
  })
}

/** Send zero velocity (equivalent to PAUSE) */
export function sendPause(): void {
  rosBridgeService.publish('/cmd_vel', {
    linear:  { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  })
}

/** Send zero velocity (equivalent to STOP) */
export function sendStop(): void {
  rosBridgeService.publish('/cmd_vel', {
    linear:  { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  })
}

/** Send zero velocity (equivalent to RESUME — robot resumes from last goal) */
export function sendResume(): void {
  // No action needed — Nav2 continues the current goal automatically
}

/** Return home — publish docking station pose as Nav2 goal */
export function returnHome(x = 0, y = 0, yaw = 0): void {
  sendNavGoal(x, y, 0, yaw)
}

/** Dock at charging station */
export function dockCommand(x = 0, y = 0, yaw = 0): void {
  sendNavGoal(x, y, 0, yaw)
}

function eulerToQuaternion(r: number, p: number, y: number) {
  const cr = Math.cos(r / 2), sr = Math.sin(r / 2)
  const cp = Math.cos(p / 2), sp = Math.sin(p / 2)
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
  return { x: sr*cp*cy - cr*sp*sy, y: cr*sp*cy + sr*cp*sy, z: cr*cp*sy - sr*sp*cy, w: cr*cp*cy + sr*sp*sy }
}
