import { create } from 'zustand'
import type { RobotStateData } from '@/types/robot'
import { defaultRosBridgeConfig } from '@/config/rosbridge'

interface ConnectionState {
  isConnected: boolean
  isConnecting: boolean
  wsUrl: string
  connectionError: string | null
  lastRobotState: RobotStateData | null
  setWsUrl: (url: string) => void
  connect: () => Promise<boolean>
  disconnect: () => void
  setConnectionError: (error: string | null) => void
}

export const useConnectionStore = create<ConnectionState>((set, _get) => ({
  isConnected: false,
  isConnecting: false,
  wsUrl: defaultRosBridgeConfig.url,
  connectionError: null,
  lastRobotState: null,
  setWsUrl: (url) => { set({ wsUrl: url }) },
  connect: async () => {
    set({ isConnecting: true, connectionError: null })
    try {
      set({ isConnected: true, isConnecting: false })
      return true
    } catch {
      set({ isConnected: false, isConnecting: false, connectionError: 'Connection failed' })
      return false
    }
  },
  disconnect: () => { set({ isConnected: false, isConnecting: false, connectionError: null }) },
  setConnectionError: (error) => set({ connectionError: error }),
}))
