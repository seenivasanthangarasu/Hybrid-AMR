/**
 * Dynamic Endpoints Resolver
 * ----------------------------
 * Resolves ROSBridge WebSocket, MJPEG Web Video Server, and Backend REST API endpoints.
 * Automatically resolves window.location.hostname if accessed from a network IP or browser.
 */

export function getRobotHostname() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  return 'localhost';
}

export function getRosbridgeUrl() {
  const env = import.meta.env?.VITE_ROSBRIDGE_URL;
  if (env && !env.includes('localhost') && !env.includes('127.0.0.1')) return env;
  const host = getRobotHostname();
  if (env && (env.includes('localhost') || env.includes('127.0.0.1'))) {
    return env.replace(/localhost|127\.0\.0\.1/, host);
  }
  return `ws://${host}:9090`;
}

export function getVideoServerUrl() {
  const env = import.meta.env?.VITE_WEB_VIDEO_URL;
  if (env && !env.includes('localhost') && !env.includes('127.0.0.1')) return env;
  const host = getRobotHostname();
  if (env && (env.includes('localhost') || env.includes('127.0.0.1'))) {
    return env.replace(/localhost|127\.0\.0\.1/, host);
  }
  return `http://${host}:8080`;
}

export function getBackendApiUrl() {
  const env = import.meta.env?.VITE_BACKEND_URL;
  if (env && !env.includes('localhost') && !env.includes('127.0.0.1')) return env;
  const host = getRobotHostname();
  if (env && (env.includes('localhost') || env.includes('127.0.0.1'))) {
    return env.replace(/localhost|127\.0\.0\.1/, host);
  }
  return `http://${host}:5001`;
}

export const DEFAULT_CAMERA_TOPIC = '/camera/color/image_raw';
export const CAMERA_NAME = 'Logitech C270 HD Web Camera';
export const CAMERA_SPECS = '720p @ 30 FPS · V4L2';

export function getCameraStreamUrl(options = {}) {
  const {
    topic = DEFAULT_CAMERA_TOPIC,
    quality,
    defaultTransport,
    framerate,
  } = options;
  const base = getVideoServerUrl();
  const queryParts = [`topic=${topic}`];
  if (quality !== undefined && quality !== null && quality !== '') {
    queryParts.push(`quality=${quality}`);
  }
  if (defaultTransport) {
    queryParts.push(`default_transport=${defaultTransport}`);
  }
  if (framerate !== undefined && framerate !== null && framerate !== '') {
    queryParts.push(`framerate=${framerate}`);
  }
  return `${base}/stream?${queryParts.join('&')}`;
}

export function getCameraViewerUrl(topic = DEFAULT_CAMERA_TOPIC) {
  const base = getVideoServerUrl();
  return `${base}/stream_viewer?topic=${topic}`;
}
