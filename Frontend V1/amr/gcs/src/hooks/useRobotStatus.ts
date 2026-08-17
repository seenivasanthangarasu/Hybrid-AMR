/** Hook — derived robot status from stores */

import { useMemo } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useRobotStore } from '@/stores/robotStore'

export function useRobotStatus() {
  const connectionStatus = useConnectionStore((s) => s.isConnected ? 'connected' : 'disconnected')
  const robotState = useRobotStore((s) => s.robotState)
  const battery = useRobotStore((s) => s.battery)
  const navMode = useRobotStore((s) => s.navMode)
  const localizationStatus = useRobotStore((s) => s.localizationStatus)

  return useMemo(() => ({
    connection: connectionStatus,
    robotState,
    battery,
    navMode,
    localizationStatus,
    /** Combined health indicator */
    health: connectionStatus === 'connected'
      ? robotState === 'error'
        ? 'critical'
        : battery.percentage > 20
          ? 'healthy'
          : 'warning'
      : 'disconnected',
  }), [connectionStatus, robotState, battery.percentage])
}
