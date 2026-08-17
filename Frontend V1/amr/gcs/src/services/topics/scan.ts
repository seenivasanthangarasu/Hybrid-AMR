/** LiDAR scan service — subscribes to /scan (sensor_msgs/msg/LaserScan) */
import { rosBridgeService } from '../ros/connection'

interface ScanPoint { angle: number; range: number; intensity: number }

export function subscribeScan(callback: (data: { origin: { x: number; y: number }; points: ScanPoint[]; maxRange: number }) => void): () => void {
  const sub = rosBridgeService.subscribe('/scan', (rawMsg: unknown) => {
    if (!rawMsg || typeof rawMsg !== 'object') return
    const m = rawMsg as Record<string, unknown>

    const angleMin = (m['angle_min'] as number) ?? 0
    const angleInc = (m['angle_increment'] as number) ?? 0.01
    const rangeMin = (m['range_min'] as number) ?? 0.1
    const rangeMax = (m['range_max'] as number) ?? 12
    const ranges = m['ranges'] as number[] | undefined
    const intensities = m['intensities'] as number[] | undefined

    if (!ranges || ranges.length === 0) return

    callback({
      origin: { x: 0, y: 0 },
      points: ranges.map((r, i) => r >= rangeMin && r <= rangeMax && isFinite(r) ? { angle: angleMin + i * angleInc, range: r, intensity: intensities?.[i] ?? 0 } : null).filter(Boolean) as ScanPoint[],
      maxRange: rangeMax,
    })
  })

  return () => { sub.unsubscribe() }
}
