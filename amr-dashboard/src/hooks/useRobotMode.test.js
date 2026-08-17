import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
import useRosTopic from './useRosTopic.js';
import useRobotMode from './useRobotMode.js';

const silent = { data: null, hasData: false, stale: true, lastReceivedAt: null };
const live = (value) => ({ data: { data: value }, hasData: true, stale: false, lastReceivedAt: 1000 });

describe('useRobotMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRosTopic.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to /robot_mode as std_msgs/String', () => {
    useRosTopic.mockReturnValue(silent);
    renderHook(() => useRobotMode());
    expect(useRosTopic).toHaveBeenCalledWith(
      expect.objectContaining({ name: '/robot_mode', messageType: 'std_msgs/String' }),
    );
  });

  it.each(['INDOOR', 'OUTDOOR'])('reports %s from the topic as a live, non-default mode', (value) => {
    useRosTopic.mockReturnValue(live(value));
    const { result } = renderHook(() => useRobotMode());
    expect(result.current).toEqual({ mode: value, isTopicLive: true, isDefault: false });
  });

  it('accepts lower-case publishers by normalising case', () => {
    useRosTopic.mockReturnValue(live('indoor'));
    const { result } = renderHook(() => useRobotMode());
    expect(result.current.mode).toBe('INDOOR');
    expect(result.current.isTopicLive).toBe(true);
  });

  // Anything outside the two known values is not a mode reading — fall back
  // rather than let an unrecognised string select a view.
  it('falls back to the default for an unrecognised mode string', () => {
    useRosTopic.mockReturnValue({ ...live('MAINTENANCE'), lastReceivedAt: 1000 });
    const { result } = renderHook(() => useRobotMode());
    expect(result.current.isTopicLive).toBe(false);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.mode).toBe('OUTDOOR');
  });

  // The grace window stops the UI flashing to the default view while
  // ROSBridge is still negotiating.
  it('marks the fallback as pending during the startup grace window', () => {
    useRosTopic.mockReturnValue(silent);
    const { result } = renderHook(() => useRobotMode());
    expect(result.current).toEqual({
      mode: 'OUTDOOR',
      isTopicLive: false,
      isDefault: true,
      pending: true,
    });
  });

  it('settles on the OUTDOOR default once the grace window expires with no message', () => {
    useRosTopic.mockReturnValue(silent);
    const { result } = renderHook(() => useRobotMode());
    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(result.current).toEqual({ mode: 'OUTDOOR', isTopicLive: false, isDefault: true });
    expect(result.current.pending).toBeUndefined();
  });

  // A topic that published once and then went quiet is not "still starting up",
  // so it must not be reported as pending even inside the grace window.
  it('is not pending inside the grace window if a message was already received', () => {
    useRosTopic.mockReturnValue({ ...silent, lastReceivedAt: 500 });
    const { result } = renderHook(() => useRobotMode());
    expect(result.current.pending).toBeUndefined();
    expect(result.current.isDefault).toBe(true);
  });

  it('clears the grace timer it created on unmount', () => {
    useRosTopic.mockReturnValue(silent);
    const set = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderHook(() => useRobotMode());
    const id = set.mock.results[0].value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
    set.mockRestore();
    clear.mockRestore();
  });
});
