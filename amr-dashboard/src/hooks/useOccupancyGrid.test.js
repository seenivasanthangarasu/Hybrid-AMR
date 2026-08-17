import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
import useRosTopic from './useRosTopic.js';
import useOccupancyGrid from './useOccupancyGrid.js';

function grid(overrides = {}) {
  return {
    info: {
      width: 2,
      height: 2,
      resolution: 0.05,
      origin: { position: { x: -1, y: -1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      ...overrides.info,
    },
    data: overrides.data ?? [-1, 0, 100, 0],
  };
}

function live(data) {
  return { data, hasData: true, stale: false, lastReceivedAt: 1000 };
}

describe('useOccupancyGrid', () => {
  beforeEach(() => {
    useRosTopic.mockReset();
  });

  // Maps are latched / published rarely, so a short staleness window would
  // wrongly blank the SLAM view on a healthy link.
  it('subscribes to /map with an unthrottled, long staleness window', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    renderHook(() => useOccupancyGrid());
    expect(useRosTopic).toHaveBeenCalledWith({
      name: '/map',
      messageType: 'nav_msgs/OccupancyGrid',
      throttle_rate: 0,
      staleMs: 15000,
    });
  });

  it('returns nulls rather than a synthesized grid before any map arrives', () => {
    useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, lastReceivedAt: null });
    const { result } = renderHook(() => useOccupancyGrid());
    expect(result.current.hasData).toBe(false);
    expect(result.current.width).toBeNull();
    expect(result.current.height).toBeNull();
    expect(result.current.resolution).toBeNull();
    expect(result.current.origin).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('flattens metadata and passes the occupancy array through untouched', () => {
    useRosTopic.mockReturnValue(live(grid()));
    const { result } = renderHook(() => useOccupancyGrid());
    expect(result.current.hasData).toBe(true);
    expect(result.current.width).toBe(2);
    expect(result.current.height).toBe(2);
    expect(result.current.resolution).toBe(0.05);
    expect(result.current.origin.position.x).toBe(-1);
    expect(result.current.data).toEqual([-1, 0, 100, 0]);
  });

  // A partial message would otherwise make the canvas index past the array.
  it.each([
    ['a missing info block', { info: null, data: [0] }],
    ['a non-numeric width', { info: { width: 'wide', height: 2 }, data: [0] }],
    ['a missing height', { info: { width: 2, height: undefined }, data: [0] }],
    ['a non-array data field', { info: { width: 2, height: 2 }, data: 'nope' }],
  ])('rejects a malformed grid with %s', (_label, msg) => {
    useRosTopic.mockReturnValue(live(msg));
    const { result } = renderHook(() => useOccupancyGrid());
    expect(result.current.hasData).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.width).toBeNull();
  });

  it('reports hasEverData once a map has been seen, even when it goes stale', () => {
    useRosTopic.mockReturnValue({
      data: grid(),
      hasData: false,
      stale: true,
      lastReceivedAt: 8000,
    });
    const { result } = renderHook(() => useOccupancyGrid());
    expect(result.current.hasData).toBe(false);
    expect(result.current.hasEverData).toBe(true);
    expect(result.current.lastReceivedAt).toBe(8000);
  });
});
