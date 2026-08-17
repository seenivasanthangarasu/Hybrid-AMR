/**
 * Robot profile configuration.
 * Contains default parameters and limits for the Hybrid AMR platform.
 */

export type NavigationMode = 'indoor' | 'outdoor' | 'hybrid'

export interface RobotProfile {
  displayName: string
  maxSpeed: number
  accelerationLimit: number
  maxAngularVelocity: number
  minTurningRadius: number
  defaultArrivalRadius: number
  supportedNavModes: NavigationMode[]
}

export const DEFAULT_ROBOT_PROFILE: RobotProfile = {
  displayName: 'Hybrid AMR',
  maxSpeed: 2.0,
  accelerationLimit: 1.0,
  maxAngularVelocity: Math.PI,
  minTurningRadius: 0.3,
  defaultArrivalRadius: 0.5,
  supportedNavModes: ['indoor', 'outdoor', 'hybrid'],
}
