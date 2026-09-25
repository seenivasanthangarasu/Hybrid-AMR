import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useBackendApi from './useBackendApi.js';

describe('useBackendApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts camera toggle in v4l2 mode', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/api/camera/toggle')) {
        const body = JSON.parse(options.body);
        expect(body).toEqual({ enable: true, mode: 'v4l2' });
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', success: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
    });

    const { result } = renderHook(() => useBackendApi(10000));
    let res;
    await act(async () => {
      res = await result.current.toggleCamera(true, 'v4l2');
    });

    expect(res.status).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/camera/toggle'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('handles camera status and inspects hardware response', async () => {
    const mockCameraHardware = {
      logitech: true,
      label: 'Logitech C270 HD WEBCAM (720p HD) (/dev/amr_camera)',
      type: 'v4l2',
      physical_camera_connected: true,
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/camera/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            running: true,
            hardware: { camera: mockCameraHardware },
          }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hardware: { camera: mockCameraHardware },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
    });

    const { result } = renderHook(() => useBackendApi(10000));
    let camStatus;
    await act(async () => {
      camStatus = await result.current.fetchCameraStatus();
    });

    expect(camStatus.hardware.camera.logitech).toBe(true);
    expect(camStatus.hardware.camera.type).toBe('v4l2');
    expect(camStatus.hardware.camera.label).toContain('Logitech C270');
  });
});
