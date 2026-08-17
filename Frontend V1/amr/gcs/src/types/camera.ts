/** Camera feed types */

export interface CameraSource {
  /** Unique device identifier */
  id: string
  /** Human-readable name */
  label: string
  /** ROS topic for the camera info (if applicable) */
  rosTopic: string | null
  /** Stream URL (JPEG relay or WebSocket) */
  streamUrl: string
  /** Supported resolution presets */
  resolutions: CameraResolution[]
  /** Default resolution to use */
  defaultResolutionId: string
}

export interface CameraResolution {
  id: string
  label: string
  width: number
  height: number
}

/** Default camera resolutions available on industrial cameras */
export const DEFAULT_RESOLUTIONS: CameraResolution[] = [
  { id: '640x480', label: '640×480', width: 640, height: 480 },
  { id: '1280x720', label: '1280×720 (HD)', width: 1280, height: 720 },
  { id: '1920x1080', label: '1920×1080 (Full HD)', width: 1920, height: 1080 },
]
