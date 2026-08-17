/** Generic ROS topic publisher — publishes to any topic via rosbridge */
import { rosBridgeService } from './connection'

export function publish(topic: string, msg: unknown): void {
  rosBridgeService.publish(topic, msg)
}

export function publishTyped(topic: string, _msgType: string, msg: unknown): void {
  rosBridgeService.publish(topic, msg)
}

/** Send velocity command to ESP32 motor controller via /cmd_vel */
export function sendVelocity(velocityX: number, velocityY: number, velocityZ = 0, angularZ = 0): void {
  publish('/cmd_vel', {
    linear:  { x: velocityX, y: velocityY, z: velocityZ },
    angular: { x: 0,      y: 0,         z: angularZ },
  })
}

/** Send a Nav2 navigation goal via /goal_pose */
export function sendNavGoal(x: number, y: number, z = 0, yaw = 0): void {
  const quaternion = eulerToQuaternion(0, 0, yaw)
  publish('/goal_pose', {
    header: { stamp: { sec: Math.floor(Date.now() / 1000), nanosec: 0 }, frame_id: 'map' },
    pose: { position: { x, y, z }, orientation: quaternion },
  })
}

/** Send AMCL initial pose reset */
export function sendInitialPose(x: number, y: number, yaw = 0): void {
  const quaternion = eulerToQuaternion(0, 0, yaw)
  publish('/initialpose', {
    header: { stamp: { sec: Math.floor(Date.now() / 1000), nanosec: 0 }, frame_id: 'map' },
    pose: {
      pose: { position: { x, y, z: 0 }, orientation: quaternion },
      covariance: [0.25, 0, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  })
}

function eulerToQuaternion(r: number, p: number, y: number) {
  const cr = Math.cos(r / 2), sr = Math.sin(r / 2)
  const cp = Math.cos(p / 2), sp = Math.sin(p / 2)
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2)
  return { x: sr*cp*cy - cr*sp*sy, y: cr*sp*cy + sr*cp*sy, z: cr*cp*sy - sr*sp*cy, w: cr*cp*cy + sr*sp*sy }
}
