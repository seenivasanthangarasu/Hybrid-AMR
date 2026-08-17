import { useCallback } from 'react'
import { useMissionStore } from '@/stores/missionStore'

export function useMapInteraction() {
  const setPending = useMissionStore((s) => s.setPending)

  return {
    createWaypointAt: useCallback((lat: number, lng: number) => {
      setPending({ lat, lng })
    }, [setPending]),
  }
}
