/** Zustand store — UI layout state (sidebar, panels, theme) */

import { create } from 'zustand'

export interface UiState {
  /** Whether the sidebar is in collapsed (icon-only) mode */
  sidebarCollapsed: boolean
  /** Currently active route/module path */
  activeRoute: string
  /** Width of the sidebar when expanded (in px) */
  sidebarWidthPx: number
  /** Currently selected map tile layer ID */
  activeMapLayer: string
  /** Whether LiDAR view is currently visible */
  lidarVisible: boolean
  /** Current theme ('light' | 'dark') */
  theme: 'light' | 'dark'
}

interface UiActions {
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveRoute: (route: string) => void
  setActiveMapLayer: (layerId: string) => void
  toggleLidarVisibility: () => void
  setLidarVisible: (visible: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
}

type UiStore = UiState & UiActions

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  activeRoute: '/',
  sidebarWidthPx: 260,
  activeMapLayer: 'osm-light',
  lidarVisible: false,
  theme: 'light',

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setActiveRoute: (route) => set({ activeRoute: route }),

  setActiveMapLayer: (layerId) => set({ activeMapLayer: layerId }),

  toggleLidarVisibility: () => set((state) => ({ lidarVisible: !state.lidarVisible })),

  setLidarVisible: (visible) => set({ lidarVisible: visible }),

  setTheme: (theme) => set({ theme }),
}))
