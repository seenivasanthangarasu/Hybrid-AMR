/** Services barrel — single entry point */

export { rosBridgeService } from './ros/connection'
export { publish, publishTyped, sendVelocity, sendInitialPose } from './ros/publisher'
export { subscribe, type SubHandle } from './ros/subscriber'
export { sendNavGoal as sendNavGoalPublisher } from './ros/publisher'

export { subscribeScan } from './topics/scan'
export { subscribeGpsFix } from './topics/fix'
export { subscribeTf } from './topics/tf'
export { subscribeMap } from './topics/map'
export { detectCameras, getAvailableCameras, setupCameraFeed } from './topics/camera'
export { subscribeDiagnostics } from './topics/diagnostics'
export { sendPause, sendStop, sendResume, returnHome, dockCommand, MISSION_COMMANDS } from './topics/mission'
