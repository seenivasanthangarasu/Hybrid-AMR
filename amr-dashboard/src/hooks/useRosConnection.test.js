import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// A minimal stand-in for the connection singleton: it records listeners so a
// test can push a state change the way the real service does on socket events.
const svc = vi.hoisted(() => {
  const obj = {
    epoch: 1,
    state: { status: 'disconnected', epoch: 1, retry: { attempt: 0, maxAttempts: 6, nextAttemptAt: null, exhausted: false } },
    listeners: new Set(),
    connect: vi.fn(),
    reconnect: vi.fn(),
    getState: () => obj.state,
    onStatusChange(cb) {
      obj.listeners.add(cb);
      return () => obj.listeners.delete(cb);
    },
    emit(next) {
      obj.state = next;
      obj.epoch = next.epoch;
      obj.listeners.forEach((cb) => cb(next.status, next));
    },
  };
  return obj;
});

vi.mock('../services/RosConnectionService.js', () => ({ default: svc }));

import useRosConnection, { useConnectionEpoch } from './useRosConnection.js';

const state = (status, overrides = {}) => ({
  status,
  epoch: 1,
  retry: { attempt: 0, maxAttempts: 6, nextAttemptAt: null, exhausted: false },
  ...overrides,
});

describe('useRosConnection', () => {
  beforeEach(() => {
    svc.listeners.clear();
    svc.connect.mockClear();
    svc.reconnect.mockClear();
    svc.state = state('disconnected');
    svc.epoch = 1;
  });

  it('seeds from the service snapshot without waiting for an event', () => {
    svc.state = state('connected');
    const { result } = renderHook(() => useRosConnection());
    expect(result.current.status).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('opens the connection on mount', () => {
    renderHook(() => useRosConnection());
    expect(svc.connect).toHaveBeenCalledTimes(1);
  });

  it('tracks status changes pushed by the service', () => {
    const { result } = renderHook(() => useRosConnection());
    expect(result.current.status).toBe('disconnected');

    act(() => svc.emit(state('connecting')));
    expect(result.current.status).toBe('connecting');
    expect(result.current.isConnected).toBe(false);

    act(() => svc.emit(state('connected')));
    expect(result.current.status).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  // isConnected gates command dispatch, so only the literal 'connected' status
  // may satisfy it — a link in any other state must never look usable.
  it.each(['connecting', 'error', 'closed', 'disconnected'])(
    'reports isConnected false for status %s',
    (status) => {
      svc.state = state(status);
      const { result } = renderHook(() => useRosConnection());
      expect(result.current.isConnected).toBe(false);
    },
  );

  it('exposes the retry budget so the header can show recovery progress', () => {
    const { result } = renderHook(() => useRosConnection());
    act(() =>
      svc.emit(
        state('closed', {
          retry: { attempt: 3, maxAttempts: 6, nextAttemptAt: 1234, exhausted: false },
        }),
      ),
    );
    expect(result.current.retry).toEqual({
      attempt: 3,
      maxAttempts: 6,
      nextAttemptAt: 1234,
      exhausted: false,
    });
  });

  it('surfaces an exhausted retry budget rather than going quiet', () => {
    const { result } = renderHook(() => useRosConnection());
    act(() =>
      svc.emit(
        state('closed', {
          retry: { attempt: 6, maxAttempts: 6, nextAttemptAt: null, exhausted: true },
        }),
      ),
    );
    expect(result.current.retry.exhausted).toBe(true);
  });

  it('delegates the operator reconnect to the service', () => {
    const { result } = renderHook(() => useRosConnection());
    act(() => result.current.reconnect());
    expect(svc.reconnect).toHaveBeenCalledTimes(1);
  });

  // A listener surviving unmount would set state on a dead component and, worse,
  // keep the whole hook tree alive for the life of the singleton.
  it('unsubscribes from the service on unmount', () => {
    const { unmount } = renderHook(() => useRosConnection());
    expect(svc.listeners.size).toBe(1);
    unmount();
    expect(svc.listeners.size).toBe(0);
  });
});

describe('useConnectionEpoch', () => {
  beforeEach(() => {
    svc.listeners.clear();
    svc.state = state('disconnected');
    svc.epoch = 1;
  });

  it('starts at the service epoch', () => {
    svc.epoch = 4;
    const { result } = renderHook(() => useConnectionEpoch());
    expect(result.current).toBe(4);
  });

  // The epoch is what forces subscriptions to rebuild after a reconnect. If it
  // did not change, panels would sit silent under a LINKED header.
  it('advances when a reconnect creates a new Ros instance', () => {
    const { result } = renderHook(() => useConnectionEpoch());
    expect(result.current).toBe(1);
    act(() => svc.emit(state('connecting', { epoch: 2 })));
    expect(result.current).toBe(2);
  });

  it('does not change on a status change that reuses the same instance', () => {
    const { result } = renderHook(() => useConnectionEpoch());
    act(() => svc.emit(state('connected', { epoch: 1 })));
    expect(result.current).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useConnectionEpoch());
    expect(svc.listeners.size).toBe(1);
    unmount();
    expect(svc.listeners.size).toBe(0);
  });
});
