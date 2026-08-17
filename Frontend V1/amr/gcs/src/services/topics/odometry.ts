/** Odometry service — subscribes to /odom (nav_msgs/msg/Odometry) */
import { rosBridgeService } from '../ros/connection'

export interface OdometryUpdate { x: number; y: number; z: number; yaw: number; vx: number; vy: number; wz: number }

/** Returns an unsubscribe function */
export function subscribeOdometry(callback: (data: OdometryUpdate) => void): () => void {
  const sub = rosBridgeService.subscribe('/odom', (rawMsg: unknown) => {
    if (!rawMsg || typeof rawMsg !== 'object') return
    const m = rawMsg as Record<string, unknown>

    const poseObj = m['pose'] as Record<string, unknown> | undefined
    const twistObj = m['twist'] as Record<string, unknown> | undefined
    const pos = (poseObj?.['pose'] ?? poseObj) as Record<string, unknown> | undefined
    const linObj = (twistObj?.['twist'] ?? twistObj) as Record<string, unknown> | undefined
    const ang = twistObj ? (twistObj['angular'] as Record<string, unknown>) : undefined
    const lin = (linObj?.['linear'] ?? linObj) as Record<string, unknown> | undefined

    callback({
      x: (pos?.['x'] as number) ?? 0, y: (pos?.['y'] as number) ?? 0, z: (pos?.['z'] as number) ?? 0,
      yaw: poseToYaw(pos),
      vx: (lin?.['x'] as number) ?? 0, vy: (lin?.['y'] as number) ?? 0,
      wz: (ang?.['z'] as number) ?? 0,
    })
  })

  return () => { sub.unsubscribe() }
}

function poseToYaw(pos?: Record<string, unknown>): number {
  if (!pos) return 0
  const x = (pos['x'] as number) ?? 0, y = (pos['y'] as number) ?? 0
  const z = (pos['z'] as number) ?? 0, w = (pos['w'] as number) ?? 1
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z))
}
