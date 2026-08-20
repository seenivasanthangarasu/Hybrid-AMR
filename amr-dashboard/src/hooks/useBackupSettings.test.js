import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useBackupSettings, {
  useSnapshotInterval,
  DEFAULT_ROTATION_MIN,
  DEFAULT_RETENTION_COUNT,
  DEFAULT_SNAPSHOT_INTERVAL_SEC,
} from './useBackupSettings.js';

describe('useBackupSettings', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults when nothing is stored', () => {
    const { result } = renderHook(() => useBackupSettings());
    expect(result.current.rotationIntervalMin).toBe(DEFAULT_ROTATION_MIN);
    expect(result.current.retentionCount).toBe(DEFAULT_RETENTION_COUNT);
  });

  it('persists changes and rehydrates them on next mount', () => {
    const { result, unmount } = renderHook(() => useBackupSettings());
    act(() => {
      result.current.setRotationIntervalMin(5);
      result.current.setRetentionCount(20);
    });
    unmount();

    const { result: fresh } = renderHook(() => useBackupSettings());
    expect(fresh.current.rotationIntervalMin).toBe(5);
    expect(fresh.current.retentionCount).toBe(20);
  });

  it('clamps non-positive/garbage input to at least 1', () => {
    const { result } = renderHook(() => useBackupSettings());
    act(() => {
      result.current.setRotationIntervalMin(-3);
      result.current.setRetentionCount('not a number');
    });
    expect(result.current.rotationIntervalMin).toBe(1);
    expect(result.current.retentionCount).toBe(1);
  });

  it('ignores a corrupted stored value and falls back to the default', () => {
    window.localStorage.setItem('amr-backup-rotation-min', 'garbage');
    const { result } = renderHook(() => useBackupSettings());
    expect(result.current.rotationIntervalMin).toBe(DEFAULT_ROTATION_MIN);
  });
});

describe('useSnapshotInterval', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults and persists independently of rotation/retention', () => {
    const { result: settings } = renderHook(() => useBackupSettings());
    const { result: snapshot, unmount } = renderHook(() => useSnapshotInterval());
    expect(snapshot.current.snapshotIntervalSec).toBe(DEFAULT_SNAPSHOT_INTERVAL_SEC);

    act(() => snapshot.current.setSnapshotIntervalSec(5));
    unmount();

    const { result: fresh } = renderHook(() => useSnapshotInterval());
    expect(fresh.current.snapshotIntervalSec).toBe(5);
    // Untouched sibling setting stays at its default.
    expect(settings.current.rotationIntervalMin).toBe(DEFAULT_ROTATION_MIN);
  });
});
