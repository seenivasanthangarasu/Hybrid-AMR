/** Pose goal command — sends a navigation target via rosbridge */

import { publish } from '../ros/publisher'

/** Send a 2D pose goal for Nav2 to follow */
export function sendNav2Goal(x: number, y: number, z: number = 0, yaw: number = 0): void {
  const quaternion = eulerToQuaternion(0, 0, yaw)
  publish('/goal_pose', {
    pose: {
      position: { x, y, z },
      orientation: quaternion,
    },
  })
}

/** Send a raw goal pose message */
export function sendRawGoal(pose: Record<string, unknown>): void {
  publish('/goal_pose', { pose })
}

function eulerToQuaternion(r: number, p: number, y: number) {
  const cr = Math.cos(r / 2), sr = Math.sin(r / 2)
  const cp = Math.cos(p / 2), sp = Math.sin(p / 2)
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
  return {
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    w: cr * cp * cy + sr * sp * sy,
  }
}
