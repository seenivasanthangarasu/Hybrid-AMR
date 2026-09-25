import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Drive useGps by controlling what its underlying topic hook returns.
vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
import useRosTopic from './useRosTopic.js';
import useGps from './useGps.js';

function fix(overrides = {}) {
  return {
    latitude: 12.9716,
    longitude: 77.5946,
    altitude: 920.5,
    status: { status: 0 },
    position_covariance: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    ...overrides,
  };
}

describe('useGps', () => {
  beforeEach(() => {
    useRosTopic.mockReset();
  });

  it('subscribes to /hiwonder/gps/fix as sensor_msgs/NavSatFix', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    renderHook(() => useGps());
    expect(useRosTopic).toHaveBeenCalledWith(
      expect.objectContaining({ name: '/hiwonder/gps/fix', messageType: 'sensor_msgs/NavSatFix' }),
    );
  });

  // The central honesty rule for this hook: with no publisher it must return
  // null coordinates, never a placeholder position.
  it('returns null coordinates and NO_DATA timing before any message arrives', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    const { result } = renderHook(() => useGps());
    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
    expect(result.current.altitude).toBeNull();
    expect(result.current.fixStatus).toBeNull();
    expect(result.current.hasData).toBe(false);
    expect(result.current.hasEverData).toBe(false);
  });

  it('passes through the fix and labels a standard FIX', () => {
    useRosTopic.mockReturnValue({
      data: fix(),
      hasData: true,
      stale: false,
      lastReceivedAt: 1234,
    });
    const { result } = renderHook(() => useGps());
    expect(result.current.latitude).toBe(12.9716);
    expect(result.current.longitude).toBe(77.5946);
    expect(result.current.altitude).toBe(920.5);
    expect(result.current.fixStatusCode).toBe(0);
    expect(result.current.fixStatus).toBe('FIX');
    expect(result.current.covariance).toHaveLength(9);
    expect(result.current.hasData).toBe(true);
    expect(result.current.lastReceivedAt).toBe(1234);
  });

  it.each([
    [-1, 'NO_FIX'],
    [0, 'FIX'],
    [1, 'SBAS_FIX'],
    [2, 'GBAS_FIX'],
  ])('maps NavSatFix status %i to %s', (code, label) => {
    useRosTopic.mockReturnValue({
      data: fix({ status: { status: code } }),
      hasData: true,
      stale: false,
      lastReceivedAt: 1,
    });
    const { result } = renderHook(() => useGps());
    expect(result.current.fixStatus).toBe(label);
  });

  it('labels an out-of-spec or absent status as UNKNOWN rather than guessing', () => {
    useRosTopic.mockReturnValue({
      data: fix({ status: { status: 7 } }),
      hasData: true,
      stale: false,
      lastReceivedAt: 1,
    });
    expect(renderHook(() => useGps()).result.current.fixStatus).toBe('UNKNOWN');

    useRosTopic.mockReturnValue({
      data: fix({ status: undefined }),
      hasData: true,
      stale: false,
      lastReceivedAt: 1,
    });
    const { result } = renderHook(() => useGps());
    expect(result.current.fixStatusCode).toBeUndefined();
    expect(result.current.fixStatus).toBe('UNKNOWN');
  });

  // REQ-17: a stale fix still surfaces its last-known position (so the map can
  // dim it and show an age) while hasData stays false so nothing reads as live.
  it('keeps the last-known position on a stale fix but reports hasData false', () => {
    useRosTopic.mockReturnValue({
      data: fix(),
      hasData: false,
      stale: true,
      lastReceivedAt: 5000,
    });
    const { result } = renderHook(() => useGps());
    expect(result.current.latitude).toBe(12.9716);
    expect(result.current.hasData).toBe(false);
    expect(result.current.hasEverData).toBe(true);
    expect(result.current.stale).toBe(true);
    expect(result.current.lastReceivedAt).toBe(5000);
  });
});
