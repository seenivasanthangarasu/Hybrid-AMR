/** Root hook — subscribes to ROS2 telemetry topics once and writes to Zustand stores.
 *  Imported in AppLayout so all tabs (Dashboard, Mission Planner, etc.) receive live data. */

import { useEffect } from 'react'
import { rosBridgeService } from '@/services/ros/connection'
import { useGpsStore } from '@/stores/gpsStore'
import { useRobotStore } from '@/stores/robotStore'
import type { GpsFix } from '@/types/gps'

/** Derive fixType from NavSatStatus code */
function navSatStatusToFixType(status: number): GpsFix['fixType'] {
  if (status >= 0) return 'fix'
  if (status === -1) return 'none'
  return 'none'
}

export function useRosTelemetry() {
  const setFix = useGpsStore((s) => s.setFix)
  const addSatellite = useGpsStore((s) => s.addSatellite)
  const clearSats = useGpsStore((s) => s.clearSats)
  const updateTimestamp = useGpsStore((s) => s.updateTimestamp)
  const updateTelemetry = useRobotStore((s) => s.updateTelemetry)
  const setSpeed = useRobotStore((s) => s.setSpeed)
  const setNavMode = useRobotStore((s) => s.setNavMode)
  const setGpsStatus = useRobotStore((s) => s.setGpsStatus)

  useEffect(() => {
    /** GPS / NavSatFix */
    const gpsSub = rosBridgeService.subscribe('/fix', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Record<string, unknown>
      const header = m['header'] as Record<string, unknown> | undefined
      const stamp = header?.['stamp'] as Record<string, number> | undefined

      const fix: GpsFix = {
        status: (m['status'] as number) ?? -2,
        service: (m['service'] as number) ?? 0,
        fixType: navSatStatusToFixType((m['status'] as number) ?? -2),
        latitude: (m['latitude'] as number) ?? 0,
        longitude: (m['longitude'] as number) ?? 0,
        altitude: (m['altitude'] as number) ?? NaN,
        hdop: null,
        numSats: (m['num_sats'] as number) ?? 0,
        satellites: [],
        timestamp: stamp
          ? (stamp['sec'] ?? 0) * 1000 + ((stamp['nanosec'] ?? 0) / 1e6)
          : Date.now(),
      }

      setFix(fix)
      updateTimestamp()
    })

    /** Odometry — for robot position when GPS is unavailable */
    const odomSub = rosBridgeService.subscribe('/odom', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Record<string, unknown>
      const pose = (m['pose']?.['pose'] ?? m['pose']) as Record<string, number> | undefined
      const lin = (m['twist']?.['twist'] ?? m['twist']) as Record<string, unknown> | undefined

      if (pose && (pose['x'] !== 0 || pose['y'] !== 0)) {
        updateTelemetry({ speed: Math.sqrt(
          ((lin?.['x'] as number) ?? 0) ** 2 +
          ((lin?.['y'] as number) ?? 0) ** 2
        )})
      }

      // Update robot store with pose position for map fallback
      if (pose) {
        updateTelemetry({ localizationStatus: 'localization_ok' })
      }
    })

    /** Battery state (sensor_msgs/BatteryState) */
    const battSub = rosBridgeService.subscribe('/battery_state', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Record<string, unknown>
      const voltage = (m['voltage'] as number) ?? 0
      const charge = (m['charge'] as number) ?? 0
      const capacity = (m['capacity_design'] as number) ?? (m['capacity'] as number) ?? 1
      updateTelemetry({
        battery: {
          percentage: Math.round(Math.min((charge / capacity) * 100, 100)),
          voltage,
          status: 'discharging',
        },
      })
    })

    /** Navigation mode from move_base feedback */
    const modeSub = rosBridgeService.subscribe('/move_base/status', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      setNavMode('auto' as const)
    })

    /** Cleanup */
    return () => {
      gpsSub.unsubscribe()
      odomSub.unsubscribe()
      battSub.unsubscribe()
      modeSub.unsubscribe()
    }
  }, [setFix, addSatellite, clearSats, updateTimestamp, updateTelemetry, setSpeed, setNavMode, setGpsStatus])
}
