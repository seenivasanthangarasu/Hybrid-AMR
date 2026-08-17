/** Zustand store — GPS/RTK position state */

import { create } from 'zustand'
import type { GpsFix, SatelliteInfo } from '@/types/gps'

interface GpsState {
  fix: GpsFix | null
  satellites: SatelliteInfo[]
  /** Last known GNSS timestamp in milliseconds */
  lastUpdateAt: number | null
}

interface GpsActions {
  setFix: (fix: GpsFix) => void
  addSatellite: (sat: SatelliteInfo) => void
  removeSatellitesAboveCount: (maxCount: number) => void
  clearSats: () => void
  updateTimestamp: () => void
  reset: () => void
}

type GpsStore = GpsState & GpsActions

export const useGpsStore = create<GpsStore>((set) => ({
  fix: null,
  satellites: [],
  lastUpdateAt: null,

  setFix: (fix) => set({ fix }),

  addSatellite: (sat) => set((state) => ({ satellites: [...state.satellites, sat] })),

  removeSatellitesAboveCount: (maxCount) => set((state) => ({
    satellites: state.satellites.slice(0, maxCount),
  })),

  clearSats: () => set({ satellites: [] }),

  updateTimestamp: () => set({ lastUpdateAt: Date.now() }),

  reset: () => set({ fix: null, satellites: [], lastUpdateAt: null }),
}))
