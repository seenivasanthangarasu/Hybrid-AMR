import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCameraSettings, {
  buildCameraUrl,
  VIDEO_SERVER_URL,
} from './useCameraSettings.js';

describe('buildCameraUrl', () => {
  it('builds standard stream URL without dimensions for auto resolution', () => {
    const url = buildCameraUrl({ resolution: 'auto' });
    expect(url).toBe(`${VIDEO_SERVER_URL}/stream?topic=%2Fcamera%2Fcamera%2Fcolor%2Fimage_raw`);
  });

  it('builds stream URL with width and height for 360p', () => {
    const url = buildCameraUrl({ resolution: '360p' });
    expect(url).toContain('stream?');
    expect(url).toContain('width=640');
    expect(url).toContain('height=360');
  });

  it('builds stream URL with width and height for 720p', () => {
    const url = buildCameraUrl({ resolution: '720p' });
    expect(url).toContain('stream?');
    expect(url).toContain('width=1280');
    expect(url).toContain('height=720');
  });

  it('builds stream URL with width and height for 1080p', () => {
    const url = buildCameraUrl({ resolution: '1080p' });
    expect(url).toContain('stream?');
    expect(url).toContain('width=1920');
    expect(url).toContain('height=1080');
  });

  it('builds snapshot URL with cache key parameter', () => {
    const url = buildCameraUrl({
      mode: 'snapshot',
      resolution: '720p',
      cacheKey: 12345,
    });
    expect(url).toContain('/snapshot?');
    expect(url).toContain('width=1280');
    expect(url).toContain('height=720');
    expect(url).toContain('_t=12345');
  });
});

describe('useCameraSettings hook', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default settings (stream mode, 720p, 1 frame in 5s)', () => {
    const { result } = renderHook(() => useCameraSettings());
    expect(result.current.mode).toBe('stream');
    expect(result.current.resolution).toBe('720p');
    expect(result.current.snapshotFrames).toBe(1);
    expect(result.current.snapshotSeconds).toBe(5);
    expect(result.current.intervalMs).toBe(5000);
    expect(result.current.streamUrl).toContain('width=1280');
    expect(result.current.streamUrl).toContain('height=720');
  });

  it('updates resolution and persists it', () => {
    const { result } = renderHook(() => useCameraSettings());

    act(() => {
      result.current.setResolution('1080p');
    });

    expect(result.current.resolution).toBe('1080p');
    expect(result.current.streamUrl).toContain('width=1920');
    expect(result.current.streamUrl).toContain('height=1080');
    expect(localStorage.getItem('amr-camera-resolution')).toBe('1080p');

    act(() => {
      result.current.setResolution('360p');
    });

    expect(result.current.resolution).toBe('360p');
    expect(result.current.streamUrl).toContain('width=640');
    expect(result.current.streamUrl).toContain('height=360');
  });

  it('switches between stream and snapshot mode', () => {
    const { result } = renderHook(() => useCameraSettings());

    act(() => {
      result.current.setMode('snapshot');
    });

    expect(result.current.mode).toBe('snapshot');
    expect(localStorage.getItem('amr-camera-view-mode')).toBe('snapshot');
    expect(result.current.lastCaptureAt).toBeGreaterThan(0);
    expect(result.current.snapshotUrl).toContain('/snapshot?');

    act(() => {
      result.current.setMode('stream');
    });

    expect(result.current.mode).toBe('stream');
    expect(localStorage.getItem('amr-camera-view-mode')).toBe('stream');
  });

  it('updates snapshot config and calculates interval correctly', () => {
    const { result } = renderHook(() => useCameraSettings());

    act(() => {
      // 2 frames in 10 seconds => 5000ms
      result.current.setSnapshotConfig({ frames: 2, seconds: 10 });
    });

    expect(result.current.snapshotFrames).toBe(2);
    expect(result.current.snapshotSeconds).toBe(10);
    expect(result.current.intervalMs).toBe(5000);

    act(() => {
      // 1 frame in 2 seconds => 2000ms
      result.current.setSnapshotConfig({ frames: 1, seconds: 2 });
    });

    expect(result.current.intervalMs).toBe(2000);
  });

  it('fires snapshot timer in snapshot mode and supports manual trigger and pause', () => {
    const { result } = renderHook(() => useCameraSettings());

    act(() => {
      result.current.setMode('snapshot');
      result.current.setSnapshotConfig({ frames: 1, seconds: 5 });
    });

    const initialKey = result.current.snapshotKey;

    // Advance by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.snapshotKey).not.toBe(initialKey);

    // Test pause
    act(() => {
      result.current.togglePause();
    });
    expect(result.current.isPaused).toBe(true);

    const pausedKey = result.current.snapshotKey;
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.snapshotKey).toBe(pausedKey);

    // Test manual trigger
    act(() => {
      result.current.triggerSnapshot();
    });
    expect(result.current.snapshotKey).not.toBe(pausedKey);
  });
});
