/** Generic ROS subscriber — creates topic subscriptions via rosbridge */
import { rosBridgeService } from './connection'

export interface SubHandle { unsubscribe: () => void }

export function subscribe<T = unknown>(
  topic: string,
  callback: (msg: T) => void,
): SubHandle {
  return rosBridgeService.subscribe(topic, (raw) => {
    if (typeof raw === 'object' && raw !== null) callback(raw as T)
  })
}

/** Subscribe to /odom — extracts position and velocity from Nav2-compatible Odometry */
export function subscribeOdometry(callback: (data: { x: number; y: number; z: number; yaw: number; vx: number; vy: number; wz: number }) => void): SubHandle {
  return subscribe('/odom', (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>

    // Nav2-compatible odometry structure
    const poseObj = m['pose'] as Record<string, unknown> | undefined
    const twistObj = m['twist'] as Record<string, unknown> | undefined
    const pos = (poseObj?.['pose'] ?? poseObj) as Record<string, unknown> | undefined
    const lin = (twistObj?.['twist'] ?? twistObj) as Record<string, unknown> | undefined
    const ang = twistObj ? ((twistObj['angular']) as Record<string, unknown>) : undefined

    callback({
      x: (pos?.['x'] as number) ?? 0,
      y: (pos?.['y'] as number) ?? 0,
      z: (pos?.['z'] as number) ?? 0,
      yaw: poseToYaw(pos),
      vx: (lin?.['x'] as number) ?? 0,
      vy: (lin?.['y'] as number) ?? 0,
      wz: (ang?.['z'] as number) ?? 0,
    })
  })
}

function poseToYaw(pos?: Record<string, unknown>): number {
  if (!pos) return 0
  const x = (pos['x'] as number) ?? 0, y = (pos['y'] as number) ?? 0
  const z = (pos['z'] as number) ?? 0, w = (pos['w'] as number) ?? 1
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z))
}
