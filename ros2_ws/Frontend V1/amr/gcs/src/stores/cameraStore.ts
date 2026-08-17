/** Zustand store — Camera feed state */

import { create } from 'zustand'
import type { CameraSource, CameraResolution } from '@/types/camera'

interface CameraState {
  sources: CameraSource[]
  activeSourceId: string | null
  activeResolution: CameraResolution
}

interface CameraActions {
  setSources: (sources: CameraSource[]) => void
  setActiveSource: (id: string) => void
  setResolution: (resolution: CameraResolution) => void
  removeSource: (id: string) => void
  reset: () => void
}

type CameraStore = CameraState & CameraActions

export const useCameraStore = create<CameraStore>((set) => ({
  sources: [],
  activeSourceId: null,
  activeResolution: { id: '1280x720', label: '1280×720 (HD)', width: 1280, height: 720 },

  setSources: (sources) => set({ sources }),

  setActiveSource: (id) => set({ activeSourceId: id }),

  setResolution: (resolution) => set({ activeResolution: resolution }),

  removeSource: (id) => set((state) => {
    const filtered = state.sources.filter((s) => s.id !== id)
    return {
      sources: filtered,
      activeSourceId: state.activeSourceId === id ? (filtered[0]?.id ?? null) : state.activeSourceId,
    }
  }),

  reset: () => set({ sources: [], activeSourceId: null }),
}))
