import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRobotHostname,
  getRosbridgeUrl,
  getVideoServerUrl,
  getBackendApiUrl,
  getCameraStreamUrl,
  getCameraViewerUrl,
  DEFAULT_CAMERA_TOPIC,
} from './endpoints.js';

describe('Endpoints Resolver', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
    window.location = { hostname: '192.168.1.50' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('resolves hostname dynamically from window.location', () => {
    expect(getRobotHostname()).toBe('192.168.1.50');
  });

  it('generates clean default stream URL when no options provided', () => {
    const stream = getCameraStreamUrl();
    expect(stream).toContain('/stream?topic=/camera/color/image_raw');
  });

  it('generates standard Logitech C270 stream URL with custom parameters when specified', () => {
    const stream = getCameraStreamUrl({
      topic: '/camera/color/image_raw',
      quality: 75,
      framerate: 30,
      defaultTransport: 'raw',
    });
    expect(stream).toContain('/stream?topic=/camera/color/image_raw');
    expect(stream).toContain('quality=75');
    expect(stream).toContain('framerate=30');
    expect(stream).toContain('default_transport=raw');
  });

  it('generates stream viewer fallback URL', () => {
    const viewer = getCameraViewerUrl(DEFAULT_CAMERA_TOPIC);
    expect(viewer).toContain('/stream_viewer?topic=/camera/color/image_raw');
  });
});
