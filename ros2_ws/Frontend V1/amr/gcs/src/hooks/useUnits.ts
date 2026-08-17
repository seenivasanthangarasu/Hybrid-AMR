/** Hook — unit system (metric/imperial) with persistence */

import { create } from 'zustand'

interface UnitsState {
  distanceUnit: 'metric' | 'imperial'
  speedUnit: 'metric' | 'imperial'
  setDistanceUnit: (unit: 'metric' | 'imperial') => void
  setSpeedUnit: (unit: 'metric' | 'imperial') => void
}

export const useUnitsStore = create<UnitsState>((set) => ({
  distanceUnit: 'metric',
  speedUnit: 'metric',
  setDistanceUnit: (unit) => set({ distanceUnit: unit }),
  setSpeedUnit: (unit) => set({ speedUnit: unit }),
}))

export function useUnits() {
  const state = useUnitsStore()
  return { ...state, toggleDistance: () => {
    const next = state.distanceUnit === 'metric' ? 'imperial' : 'metric'
    state.setDistanceUnit(next)
  }, toggleSpeed: () => {
    const next = state.speedUnit === 'metric' ? 'imperial' : 'metric'
    state.setSpeedUnit(next)
  }}
}
