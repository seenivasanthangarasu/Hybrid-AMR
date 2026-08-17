import { create } from 'zustand'
import type { Waypoint, MissionStatus, Mission } from '@/types/mission'
import { createWaypoint, createEmptyMission } from '@/types/mission'

interface MissionState extends Mission { pending: { lat: number; lng: number } | null }

interface MissionActions {
  setStatus: (status: MissionStatus) => void
  setWaypoints: (waypoints: Waypoint[]) => void
  addWaypoint: (lat: number, lng: number) => void
  updateWaypoint: (id: string, updates: Partial<Waypoint>) => void
  removeWaypoint: (id: string) => void
  reorderWaypoints: (fromIndex: number, toIndex: number) => void
  setPending: (pending: MissionState['pending']) => void
  clearMission: () => void
  startMission: () => Promise<void>
  pauseMission: () => Promise<void>
  resumeMission: () => Promise<void>
  stopMission: () => Promise<void>
  setWaypointName: (id: string, name: string) => void
}

type MissionStore = MissionState & MissionActions

export const useMissionStore = create<MissionStore>((set, _get) => ({
  ...createEmptyMission(),
  pending: null,
  setStatus: (status) => set({ currentStatus: status }),
  setWaypoints: (waypoints) => set({ waypoints }),
  addWaypoint: (lat, lng) => { set((s) => { const wp = createWaypoint(lat, lng, s.waypoints.length); return { waypoints: [...s.waypoints, wp] } }) },
  updateWaypoint: (id, updates) => { set((s) => ({ waypoints: s.waypoints.map((wp) => wp.id === id ? { ...wp, ...updates } : wp) })) },
  removeWaypoint: (id) => { set((s) => { const filtered = s.waypoints.filter((wp) => wp.id !== id); return { waypoints: filtered, activeWaypointIndex: null } }) },
  reorderWaypoints: (fromIndex, toIndex) => { set((s) => { const copy = [...s.waypoints]; const [moved] = copy.splice(fromIndex, 1); copy.splice(toIndex, 0, moved); return { waypoints: copy } }) },
  setPending: (pending) => set({ pending }),
  clearMission: () => set(createEmptyMission()),
  startMission: async () => { set({ currentStatus: 'executing', activeWaypointIndex: 0 }) },
  pauseMission: async () => { set({ currentStatus: 'paused' }) },
  resumeMission: async () => { set((s) => ({ currentStatus: 'executing', activeWaypointIndex: s.activeWaypointIndex ?? 0 })) },
  stopMission: async () => { set({ currentStatus: 'idle', activeWaypointIndex: null }) },
  setWaypointName: (id, name) => { set((s) => ({ waypoints: s.waypoints.map((wp) => wp.id === id ? { ...wp, name } : wp) })) },
}))
