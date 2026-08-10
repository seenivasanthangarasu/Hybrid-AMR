import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the subscribe/unsubscribe the hook wires up so we can drive messages
// and assert cleanup without a real rosbridge connection.
const hoisted = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));

vi.mock('../services/RosConnectionService.js', () => ({
  default: {
    ros: {},
    connect: vi.fn(),
    getTopic: vi.fn(() => ({ subscribe: hoisted.subscribe, unsubscribe: hoisted.unsubscribe })),
  },
}));

import useRosTopic from './useRosTopic.js';

describe('useRosTopic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.subscribe.mockClear();
    hoisted.unsubscribe.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no data and marked stale', () => {
    const { result } = renderHook(() => useRosTopic({ name: '/t', messageType: 'std_msgs/String' }));
    expect(result.current.hasData).toBe(false);
    expect(result.current.stale).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('goes live on a message, then stale after the staleness window elapses', () => {
    const { result } = renderHook(() =>
      useRosTopic({ name: '/t', messageType: 'std_msgs/String', staleMs: 4000 }),
    );
    const handler = hoisted.subscribe.mock.calls[0][0];

    act(() => {
      handler({ data: 'hello' });
    });
    expect(result.current.hasData).toBe(true);
    expect(result.current.data).toEqual({ data: 'hello' });
    expect(result.current.stale).toBe(false);

    // No further messages for longer than staleMs → watchdog flips to stale.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.stale).toBe(true);
    expect(result.current.hasData).toBe(false);
  });

  it('unsubscribes the same handler on unmount', () => {
    const { unmount } = renderHook(() => useRosTopic({ name: '/t', messageType: 'std_msgs/String' }));
    const handler = hoisted.subscribe.mock.calls[0][0];
    unmount();
    expect(hoisted.unsubscribe).toHaveBeenCalledWith(handler);
  });
});
