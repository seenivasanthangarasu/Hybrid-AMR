/** Emergency stop command — publishes zero velocity to /cmd_vel */

import { publish } from '../ros/publisher'

export function emergencyStop(): void {
  publish('/cmd_vel', {
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  })
}

/** Return home command */
export function returnHomeCommand(): void {
  publish('/return_home', { enabled: true })
}

/** Dock command — direct robot to charging station */
export function dockCommand(): void {
  publish('/dock', { command: 'dock' })
}
