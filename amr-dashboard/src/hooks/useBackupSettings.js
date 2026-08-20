import { useState, useEffect } from 'react';

/**
 * Persisted "Data & Backups" settings — plain numbers in localStorage, same
 * simple pattern as useTheme.js/useLayout.js (no file handle involved here,
 * so no IndexedDB needed).
 *
 * Rotation interval + retention count are shared by MCAP recording and
 * camera-snapshot backups (data-handling-nav2-tasks.md decision: one
 * schedule, not two). Snapshot capture interval is separate — it controls
 * how often a *new frame* is captured, not how often files rotate.
 */
const ROTATION_KEY = 'amr-backup-rotation-min';
const RETENTION_KEY = 'amr-backup-retention-count';
const SNAPSHOT_INTERVAL_KEY = 'amr-camera-snapshot-interval-sec';

export const DEFAULT_ROTATION_MIN = 15;
export const DEFAULT_RETENTION_COUNT = 10;
export const DEFAULT_SNAPSHOT_INTERVAL_SEC = 30;

function loadNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable — value stays in-memory only for this session */
  }
}

export default function useBackupSettings() {
  const [rotationIntervalMin, setRotationIntervalMinState] = useState(() =>
    loadNumber(ROTATION_KEY, DEFAULT_ROTATION_MIN),
  );
  const [retentionCount, setRetentionCountState] = useState(() =>
    loadNumber(RETENTION_KEY, DEFAULT_RETENTION_COUNT),
  );

  useEffect(() => persist(ROTATION_KEY, rotationIntervalMin), [rotationIntervalMin]);
  useEffect(() => persist(RETENTION_KEY, retentionCount), [retentionCount]);

  return {
    rotationIntervalMin,
    setRotationIntervalMin: (v) => setRotationIntervalMinState(Math.max(1, Math.floor(Number(v) || 0))),
    retentionCount,
    setRetentionCount: (v) => setRetentionCountState(Math.max(1, Math.floor(Number(v) || 0))),
  };
}

export function useSnapshotInterval() {
  const [snapshotIntervalSec, setSnapshotIntervalSecState] = useState(() =>
    loadNumber(SNAPSHOT_INTERVAL_KEY, DEFAULT_SNAPSHOT_INTERVAL_SEC),
  );

  useEffect(() => persist(SNAPSHOT_INTERVAL_KEY, snapshotIntervalSec), [snapshotIntervalSec]);

  return {
    snapshotIntervalSec,
    setSnapshotIntervalSec: (v) => setSnapshotIntervalSecState(Math.max(1, Math.floor(Number(v) || 0))),
  };
}
