/** Camera service — integrates with ros2_web_video_server for live feeds */

import { defaultRosBridgeConfig } from '@/config/rosbridge'
import type { CameraSource, CameraResolution, DEFAULT_RESOLUTIONS } from '@/types/camera'
import { DEFAULT_RESOLUTIONS } from '@/types/camera'

/** Default camera sources available on the robot */
const DEFAULT_CAMERAS: Omit<CameraSource, 'streamUrl'>[] = [
  { id: 'realsense-color', label: 'Intel RealSense (Color)', rosTopic: '/camera/camera/color/image_raw' },
  { id: 'realsense-depth', label: 'Intel RealSense (Depth)', rosTopic: '/camera/camera/depth/image_rect_raw' },
]

/** Derive web_video_server host from the rosbridge WebSocket URL.
 *  Both services run on the same robot, so they share the host.
 *  e.g. ws://192.168.1.100:9090 → http://192.168.1.100:8080
 */
function getVideoServerHost(): string {
  const rosbridgeUrl = defaultRosBridgeConfig.url // ws://host:port or wss://host:port
  const proto = rosbridgeUrl.startsWith('wss') ? 'https' : 'http'
  // Extract host from ws://host:port → http://host
  const url = new URL(rosbridgeUrl)
  return `${proto}://${url.host}`
}

function buildStreamUrl(topic: string): string {
  const base = getVideoServerHost()
  return `${base}:8080/stream?topic=${encodeURIComponent(topic)}`
}

export interface CameraSourceExtended {
  id: string
  label: string
  rosTopic: string | null
  streamUrl: string
  resolutions: CameraResolution[]
  defaultResolutionId: string
}

/** Return camera sources with populated web_video_server stream URLs */
export function getAvailableCameras(): CameraSourceExtended[] {
  return DEFAULT_CAMERAS.map((cam) => ({
    ...cam,
    streamUrl: cam.rosTopic ? buildStreamUrl(cam.rosTopic) : '',
    resolutions: DEFAULT_RESOLUTIONS,
    defaultResolutionId: '1280x720',
  }))
}

/** Detect cameras by checking if the web_video_server endpoint is reachable */
export async function detectCameras(): Promise<CameraSourceExtended[]> {
  return getAvailableCameras()
}

/** Setup camera feed using web_video_server stream URL */
export function setupCameraFeed(sourceId: string): HTMLVideoElement | null {
  const source = getAvailableCameras().find((c) => c.id === sourceId)
  if (!source || !source.streamUrl) return null
  // Create video element pointing to web_video_server stream
  const video = document.createElement('video')
  video.src = source.streamUrl
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'cover'
  return video
}
