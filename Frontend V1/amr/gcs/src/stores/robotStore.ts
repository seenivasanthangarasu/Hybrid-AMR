/** Zustand store — Robot telemetry state */

import { create } from 'zustand'
import type { RobotStateData, BatteryInfo, NavMode, LocalizationStatus, GpsFixType, RobotState as RobotStatusState } from '@/types/robot'
import { createDefaultRobotState } from '@/types/robot'

interface RobotState extends RobotStateData {
  /** Raw battery data received from ROS2 */
  rawBatteryMsg: unknown | null
}

interface RobotActions {
  updateTelemetry: (data: Partial<RobotStateData>) => void
  setBattery: (battery: BatteryInfo) => void
  setNavMode: (mode: NavMode) => void
  setLocalizationStatus: (status: LocalizationStatus) => void
  setGpsStatus: (status: GpsFixType) => void
  setRtkFixStatus: (status: GpsFixType) => void
  setSpeed: (speed: number, angularSpeed?: number) => void
  setRobotState: (state: RobotStatusState) => void
  setRssi: (rssi: number) => void
  resetState: () => void
}

type RobotStore = RobotState & RobotActions

export const useRobotStore = create<RobotStore>((set) => ({
  ...createDefaultRobotState(),
  rawBatteryMsg: null,

  updateTelemetry: (data) => set((state) => ({ ...state, ...data })),

  setBattery: (battery) => set({ battery }),

  setNavMode: (mode) => set({ navMode: mode }),

  setLocalizationStatus: (status) => set({ localizationStatus: status }),

  setGpsStatus: (status) => set({ gpsStatus: status }),

  setRtkFixStatus: (status) => set({ rtkFixStatus: status }),

  setSpeed: (speed, angularSpeed = 0) => set((state) => ({ ...state, speed, angularSpeed })),

  setRobotState: (state) => set({ robotState: state }),

  setRssi: (rssi) => set({ rssi }),

  resetState: () => set(createDefaultRobotState()),
}))
