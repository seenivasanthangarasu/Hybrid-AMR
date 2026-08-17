/** Hook — waypoint CRUD operations with map synchronization */

import { useMissionStore } from '@/stores/missionStore'

export function useWaypoints() {
  const waypoints = useMissionStore((s) => s.waypoints)
  const addWaypoint = useMissionStore((s) => s.addWaypoint)
  const updateWaypoint = useMissionStore((s) => s.updateWaypoint)
  const removeWaypoint = useMissionStore((s) => s.removeWaypoint)
  const reorderWaypoints = useMissionStore((s) => s.reorderWaypoints)
  const clearMission = useMissionStore((s) => s.clearMission)

  return {
    waypoints,
    addWaypoint: (lat: number, lng: number) => addWaypoint(lat, lng),
    updateWaypoint,
    removeWaypoint,
    reorderWaypoints,
    clearMission,
    /** Validate all waypoints have required fields */
    isValid: () => waypoints.every((wp) => wp.lat !== 0 && wp.lng !== 0 && wp.name.trim() !== ''),
    /** Get waypoint names in order */
    names: () => waypoints.map((wp) => wp.name),
    /** Check if mission has enough waypoints to execute (at least 2) */
    isExecutable: () => waypoints.length >= 2,
  }
}
