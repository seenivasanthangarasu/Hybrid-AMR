import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Capture every TFClient the hook builds so we can drive transforms and assert
// the subscribe/unsubscribe lifecycle without a live rosbridge.
const tf = vi.hoisted(() => {
  const clients = [];
  class TFClient {
    constructor(options) {
      this.options = options;
      this.handlers = new Map();
      this.unsubscribed = [];
      this.disposed = false;
      clients.push(this);
    }
    subscribe(frameId, cb) {
      this.handlers.set(frameId, cb);
    }
    unsubscribe(frameId) {
      this.unsubscribed.push(frameId);
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { clients, TFClient };
});

vi.mock('roslib', () => ({ default: { TFClient: tf.TFClient } }));

const rosMock = vi.hoisted(() => ({ ros: {}, connect: vi.fn() }));
vi.mock('../services/RosConnectionService.js', () => ({ default: rosMock }));

const epochMock = vi.hoisted(() => ({ value: 1 }));
vi.mock('./useRosConnection.js', () => ({
  useConnectionEpoch: () => epochMock.value,
}));

import useTF from './useTF.js';

const transform = { translation: { x: 1, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };

describe('useTF', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tf.clients.length = 0;
    rosMock.ros = {};
    rosMock.connect.mockClear();
    epochMock.value = 1;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to tracking base_link in the map frame', () => {
    renderHook(() => useTF());
    expect(tf.clients[0].options.fixedFrame).toBe('map');
    expect(tf.clients[0].handlers.has('base_link')).toBe(true);
  });

  it('honours an explicit frame pair', () => {
    renderHook(() => useTF({ frameId: 'laser', fixedFrame: 'odom' }));
    expect(tf.clients[0].options.fixedFrame).toBe('odom');
    expect(tf.clients[0].handlers.has('laser')).toBe(true);
  });

  it('opens the connection when the service has no Ros instance yet', () => {
    rosMock.ros = null;
    renderHook(() => useTF());
    expect(rosMock.connect).toHaveBeenCalled();
  });

  // Returning a zero pose before a real transform arrives would draw the robot
  // at the map origin as if that were a measurement.
  it('returns null with no transform received', () => {
    const { result } = renderHook(() => useTF());
    expect(result.current.transform).toBeNull();
    expect(result.current.hasData).toBe(false);
    expect(result.current.hasEverData).toBe(false);
    expect(result.current.stale).toBe(true);
    expect(result.current.lastReceivedAt).toBeNull();
  });

  it('goes live on the first transform', () => {
    const { result } = renderHook(() => useTF());
    act(() => {
      tf.clients[0].handlers.get('base_link')(transform);
    });
    expect(result.current.transform).toBe(transform);
    expect(result.current.hasData).toBe(true);
    expect(result.current.stale).toBe(false);
    expect(result.current.lastReceivedAt).toBeGreaterThan(0);
  });

  it('flips to stale once the transform stops arriving', () => {
    const { result } = renderHook(() => useTF({ staleMs: 4000 }));
    act(() => {
      tf.clients[0].handlers.get('base_link')(transform);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.stale).toBe(true);
    expect(result.current.hasData).toBe(false);
    // The last-known pose is kept so the view can dim it rather than blank out.
    expect(result.current.transform).toBe(transform);
    expect(result.current.hasEverData).toBe(true);
  });

  it('stays live while transforms keep arriving inside the window', () => {
    const { result } = renderHook(() => useTF({ staleMs: 4000 }));
    const push = () => act(() => tf.clients[0].handlers.get('base_link')(transform));
    push();
    act(() => vi.advanceTimersByTime(2000));
    push();
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.stale).toBe(false);
    expect(result.current.hasData).toBe(true);
  });

  it('honours a custom staleness window', () => {
    const { result } = renderHook(() => useTF({ staleMs: 10000 }));
    act(() => {
      tf.clients[0].handlers.get('base_link')(transform);
    });
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.stale).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.stale).toBe(true);
  });

  // A TFClient is bound to one ROSLIB.Ros; after a reconnect the old client is
  // dead, so the epoch change must build a new one or the pose never returns.
  it('rebuilds the client when the connection epoch advances', () => {
    const { rerender } = renderHook(() => useTF());
    expect(tf.clients).toHaveLength(1);

    epochMock.value = 2;
    rerender();

    expect(tf.clients).toHaveLength(2);
    expect(tf.clients[0].unsubscribed).toEqual(['base_link']);
    expect(tf.clients[0].disposed).toBe(true);
  });

  it('rebuilds the client when the tracked frame changes', () => {
    const { rerender } = renderHook(({ frameId }) => useTF({ frameId }), {
      initialProps: { frameId: 'base_link' },
    });
    rerender({ frameId: 'laser' });
    expect(tf.clients).toHaveLength(2);
    expect(tf.clients[0].unsubscribed).toEqual(['base_link']);
    expect(tf.clients[1].handlers.has('laser')).toBe(true);
  });

  it('unsubscribes and disposes the client on unmount', () => {
    const { unmount } = renderHook(() => useTF());
    unmount();
    expect(tf.clients[0].unsubscribed).toEqual(['base_link']);
    expect(tf.clients[0].disposed).toBe(true);
  });

  it('tolerates a TFClient with no dispose method', () => {
    const { unmount } = renderHook(() => useTF());
    tf.clients[0].dispose = undefined;
    expect(() => unmount()).not.toThrow();
  });
});
