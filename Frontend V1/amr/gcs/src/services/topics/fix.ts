/** GPS fix service — parses sensor_msgs/msg/NavSatFix from ublox_gps_node */
import { rosBridgeService } from '../ros/connection'

export function subscribeGpsFix(callback: (data: {
  lat: number; lng: number; alt: number; hdop: number | null
  fixType: string; status: number; service: number; timestamp: number
}) => void): () => void {
  const sub = rosBridgeService.subscribe('/fix', (rawMsg: unknown) => {
    if (!rawMsg || typeof rawMsg !== 'object') return
    const m = rawMsg as Record<string, unknown>

    const header = m['header'] as Record<string, unknown> | undefined
    const stamp = header?.['stamp'] as Record<string, number> | undefined

    callback({
      lat: (m['latitude'] as number) ?? 0,
      lng: (m['longitude'] as number) ?? 0,
      alt: (m['altitude'] as number) ?? NaN,
      hdop: null,
      fixType: statusToFixType((m['status'] as number) ?? -2),
      status: (m['status'] as number) ?? -2,
      service: (m['service'] as number) ?? 0,
      timestamp: stamp ? (stamp['sec'] ?? 0) * 1000 + ((stamp['nanosec'] ?? 0) / 1e6) : Date.now(),
    })
  })

  return () => { sub.unsubscribe() }
}

function statusToFixType(status: number): string {
  if (status >= 0) return 'fix'
  if (status === -1) return 'no_fix'
  return 'unknown'
}
