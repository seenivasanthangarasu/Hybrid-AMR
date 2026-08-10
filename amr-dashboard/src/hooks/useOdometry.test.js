import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Drive useOdometry by controlling what its underlying topic hook returns.
vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
import useRosTopic from './useRosTopic.js';
import useOdometry from './useOdometry.js';

function odomMsg(x, y, tSec) {
  return {
    pose: { pose: { position: { x, y }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
    twist: { twist: { linear: { x: 0 }, angular: { z: 0 } } },
    header: { stamp: { sec: tSec, nanosec: 0 } },
  };
}

function live(data) {
  return { data, hasData: true, stale: false, lastReceivedAt: Date.now() };
}

describe('useOdometry time-aware jump rejection', () => {
  beforeEach(() => {
    useRosTopic.mockReset();
  });

  it('accumulates a plausible move but rejects (and flags) an impossible jump', () => {
    useRosTopic.mockReturnValue(live(odomMsg(0, 0, 0)));
    const { result, rerender } = renderHook(() => useOdometry());
    expect(result.current.distanceTravelled).toBeCloseTo(0, 5);
    expect(result.current.lastRejectedJumpAt).toBeNull();

    // 1 m over 1 s — well within MAX_SPEED_MPS, counted.
    useRosTopic.mockReturnValue(live(odomMsg(1, 0, 1)));
    rerender();
    expect(result.current.distanceTravelled).toBeCloseTo(1, 5);
    expect(result.current.lastRejectedJumpAt).toBeNull();

    // 99 m over 1 s — physically impossible → rejected, distance unchanged,
    // and the resync is surfaced rather than silently dropped.
    useRosTopic.mockReturnValue(live(odomMsg(100, 0, 2)));
    rerender();
    expect(result.current.distanceTravelled).toBeCloseTo(1, 5);
    expect(result.current.lastRejectedJumpAt).toBeInstanceOf(Date);
  });
});
