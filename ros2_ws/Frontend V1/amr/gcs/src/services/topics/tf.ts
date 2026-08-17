/** TF transform service — subscribes to /tf (tf2_msgs/msg/TFMessage) */
import { rosBridgeService } from '../ros/connection'

interface TransformData { frameId: string; childFrameId: string; translation: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }

export function subscribeTf(callback: (transforms: TransformData[]) => void): () => void {
  const sub = rosBridgeService.subscribe('/tf', (rawMsg: unknown) => {
    if (!rawMsg || typeof rawMsg !== 'object') return
    const m = rawMsg as Record<string, unknown>
    const list = m['transforms'] as Array<Record<string, unknown>> | undefined
    if (!list) return

    const data: TransformData[] = list.map((t) => {
      const tr = t['translation'] as Record<string, number> | undefined
      const rt = t['rotation'] as Record<string, number> | undefined
      return { frameId: (t['header'] as Record<string, unknown>)?.['frame_id'] as string ?? '', childFrameId: (t['child_frame_id'] as string) ?? '', translation: { x: tr?.['x'] ?? 0, y: tr?.['y'] ?? 0, z: tr?.['z'] ?? 0 }, rotation: { x: rt?.['x'] ?? 0, y: rt?.['y'] ?? 0, z: rt?.['z'] ?? 0, w: rt?.['w'] ?? 1 } }
    })

    callback(data)
  })

  return () => { sub.unsubscribe() }
}
