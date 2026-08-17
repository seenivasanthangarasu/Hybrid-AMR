import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useNow from './useNow.js';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the current time', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.now());
  });

  it('advances on each tick of the default 1s interval', () => {
    const { result } = renderHook(() => useNow());
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(start + 1000);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(start + 3000);
  });

  it('does not update before the interval elapses', () => {
    const { result } = renderHook(() => useNow(1000));
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(start);
  });

  it('honours a custom interval', () => {
    const { result } = renderHook(() => useNow(250));
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(start + 250);
  });

  // A leaked interval would keep re-rendering an unmounted panel forever.
  it('clears the interval it created on unmount', () => {
    const set = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1000));
    const id = set.mock.results[0].value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
    set.mockRestore();
    clear.mockRestore();
  });

  it('restarts the ticker when the interval prop changes', () => {
    const { result, rerender } = renderHook(({ ms }) => useNow(ms), {
      initialProps: { ms: 1000 },
    });
    const start = result.current;
    rerender({ ms: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(start + 100);
  });
});
