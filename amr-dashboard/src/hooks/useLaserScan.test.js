import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
import useRosTopic from './useRosTopic.js';
import useLaserScan from './useLaserScan.js';

function scan(ranges, overrides = {}) {
  return {
    angle_min: 0,
    angle_increment: Math.PI / 2, // 4 beams: 0°, 90°, 180°, 270°
    range_min: 0.1,
    range_max: 10,
    ranges,
    ...overrides,
  };
}

function live(data) {
  return { data, hasData: true, stale: false, lastReceivedAt: 1000 };
}

describe('useLaserScan', () => {
  beforeEach(() => {
    useRosTopic.mockReset();
  });

  it('subscribes to /scan as sensor_msgs/LaserScan', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    renderHook(() => useLaserScan());
    expect(useRosTopic).toHaveBeenCalledWith(
      expect.objectContaining({ name: '/scan', messageType: 'sensor_msgs/LaserScan' }),
    );
  });

  it('returns an empty point set with no scan yet', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.points).toEqual([]);
    expect(result.current.minRange).toBeNull();
    expect(result.current.raw).toBeNull();
    expect(result.current.hasData).toBe(false);
    expect(result.current.hasEverData).toBe(false);
  });

  it('projects each beam to cartesian coordinates using its angle', () => {
    useRosTopic.mockReturnValue(live(scan([2, 3, 4, 5])));
    const { result } = renderHook(() => useLaserScan());

    expect(result.current.points).toHaveLength(4);
    const [p0, p1] = result.current.points;
    expect(p0.angle).toBeCloseTo(0, 6);
    expect(p0.x).toBeCloseTo(2, 6);
    expect(p0.y).toBeCloseTo(0, 6);
    expect(p1.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(p1.x).toBeCloseTo(0, 6);
    expect(p1.y).toBeCloseTo(3, 6);
    expect(result.current.minRange).toBe(2);
    expect(result.current.raw).toBeTruthy();
  });

  // Per the LaserScan spec, out-of-range readings are reported as Infinity/NaN.
  // These must be dropped, never coerced into a fake obstacle distance.
  it('drops Infinity and NaN readings instead of substituting values', () => {
    useRosTopic.mockReturnValue(live(scan([Infinity, 3, NaN, -Infinity])));
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.points).toHaveLength(1);
    expect(result.current.points[0].range).toBe(3);
    expect(result.current.minRange).toBe(3);
  });

  it('drops readings outside [range_min, range_max]', () => {
    useRosTopic.mockReturnValue(live(scan([0.05, 0.1, 10, 11])));
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.points.map((p) => p.range)).toEqual([0.1, 10]);
    expect(result.current.minRange).toBe(0.1);
  });

  it('reports the nearest valid range regardless of beam order', () => {
    useRosTopic.mockReturnValue(live(scan([9, 1.5, 4, 7])));
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.minRange).toBe(1.5);
  });

  it('yields no points when every beam is out of range', () => {
    useRosTopic.mockReturnValue(live(scan([Infinity, Infinity, NaN, 99])));
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.points).toEqual([]);
    expect(result.current.minRange).toBeNull();
  });

  it('treats a malformed message with no ranges array as no data', () => {
    useRosTopic.mockReturnValue(live(scan(undefined)));
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.hasData).toBe(false);
    expect(result.current.points).toEqual([]);
    // The message still arrived, so the panel shows STALE-style fallback, not NO SIGNAL.
    expect(result.current.hasEverData).toBe(true);
  });

  it('stops reporting live points once the scan goes stale', () => {
    useRosTopic.mockReturnValue({
      data: scan([2, 3, 4, 5]),
      hasData: false,
      stale: true,
      lastReceivedAt: 4000,
    });
    const { result } = renderHook(() => useLaserScan());
    expect(result.current.hasData).toBe(false);
    expect(result.current.points).toEqual([]);
    expect(result.current.hasEverData).toBe(true);
    expect(result.current.lastReceivedAt).toBe(4000);
  });
});
