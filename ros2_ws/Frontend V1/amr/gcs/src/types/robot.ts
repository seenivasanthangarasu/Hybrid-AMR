/** Robot state and telemetry types */

export type BatteryStatus = 'charging' | 'discharging' | 'full' | 'low' | 'critical'
export type NavMode = 'indoor' | 'outdoor' | 'hybrid'
export type LocalizationStatus = 'localizing' | 'localized' | 'lost'
export type GpsFixType = 'none' | 'fix' | 'deadReckoning' | 'time' | 'rtkFloat' | 'rtkFixed'
export type RobotState = 'ready' | 'idle' | 'executing_mission' | 'paused' | 'returning_home' | 'docking' | 'error'

export interface BatteryInfo {
  percentage: number    // 0–100
  voltage: number       // volts
  status: BatteryStatus
}

export interface RobotStateData {
  battery: BatteryInfo
  speed: number          // m/s (absolute value)
  angularSpeed: number   // rad/s
  navMode: NavMode
  missionStatus: string | null
  localizationStatus: LocalizationStatus
  gpsStatus: GpsFixType
  rtkFixStatus: GpsFixType
  rssi: number          // signal strength in dBm (-100 to -50)
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  robotState: RobotState
}

/** Create a default disconnected robot state */
export function createDefaultRobotState(): RobotStateData {
  return {
    battery: { percentage: 0, voltage: 0, status: 'discharging' },
    speed: 0,
    angularSpeed: 0,
    navMode: 'hybrid',
    missionStatus: null,
    localizationStatus: 'localizing',
    gpsStatus: 'none',
    rtkFixStatus: 'none',
    rssi: -100,
    connectionStatus: 'disconnected',
    robotState: 'idle',
  }
}
