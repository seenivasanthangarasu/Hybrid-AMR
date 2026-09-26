import { useState, useEffect, useCallback, useRef } from 'react';

export const VIDEO_SERVER_URL = import.meta.env.VITE_WEB_VIDEO_URL || 'http://localhost:8080';
export const CAMERA_TOPIC = '/camera/camera/color/image_raw';

export const CAMERA_RESOLUTIONS = {
  auto: { id: 'auto', label: 'Auto', width: null, height: null, badge: 'AUTO' },
  '360p': { id: '360p', label: '360p', width: 640, height: 360, badge: '360P' },
  '720p': { id: '720p', label: '720p', width: 1280, height: 720, badge: '720P' },
  '1080p': { id: '1080p', label: '1080p', width: 1920, height: 1080, badge: '1080P' },
};

export const SNAPSHOT_PRESETS = [
  { label: '1f / 1s', frames: 1, seconds: 1 },
  { label: '1f / 2s', frames: 1, seconds: 2 },
  { label: '1f / 5s', frames: 1, seconds: 5 },
  { label: '1f / 10s', frames: 1, seconds: 10 },
  { label: '1f / 30s', frames: 1, seconds: 30 },
];

const STORAGE_KEYS = {
  mode: 'amr-camera-view-mode',
  resolution: 'amr-camera-resolution',
  frames: 'amr-camera-snapshot-frames',
  seconds: 'amr-camera-snapshot-seconds',
};

const SETTINGS_EVENT = 'amr-camera-settings-changed';

function loadStoredString(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val !== null && val !== undefined ? val : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function persist(key, val) {
  try {
    localStorage.setItem(key, String(val));
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { key, val } }));
  } catch {
    // Ignore storage quota / access issues
  }
}

/**
 * Builds the URL for either the continuous stream or snapshot endpoint of web_video_server.
 */
export function buildCameraUrl({
  baseUrl = VIDEO_SERVER_URL,
  mode = 'stream',
  topic = CAMERA_TOPIC,
  resolution = 'auto',
  cacheKey = null,
}) {
  const res = CAMERA_RESOLUTIONS[resolution] || CAMERA_RESOLUTIONS.auto;
  const endpoint = mode === 'snapshot' ? 'snapshot' : 'stream';
  const params = new URLSearchParams();
  params.set('topic', topic);

  if (res.width && res.height) {
    params.set('width', String(res.width));
    params.set('height', String(res.height));
  }

  if (cacheKey !== null && cacheKey !== undefined) {
    params.set(mode === 'snapshot' ? '_t' : '_r', String(cacheKey));
  }

  return `${baseUrl}/${endpoint}?${params.toString()}`;
}

/**
 * Hook to manage camera streaming & snapshot mode, resolution, and interval timer.
 */
export default function useCameraSettings({ baseUrl = VIDEO_SERVER_URL, topic = CAMERA_TOPIC } = {}) {
  const [mode, setModeState] = useState(() => loadStoredString(STORAGE_KEYS.mode, 'stream'));
  const [resolution, setResolutionState] = useState(() => {
    const stored = loadStoredString(STORAGE_KEYS.resolution, '720p');
    return CAMERA_RESOLUTIONS[stored] ? stored : '720p';
  });
  const [snapshotFrames, setSnapshotFramesState] = useState(() => loadStoredNumber(STORAGE_KEYS.frames, 1));
  const [snapshotSeconds, setSnapshotSecondsState] = useState(() => loadStoredNumber(STORAGE_KEYS.seconds, 5));
  const [isPaused, setIsPaused] = useState(false);

  const [snapshotKey, setSnapshotKey] = useState(() => Date.now());
  const [lastCaptureAt, setLastCaptureAt] = useState(null);
  const [nextCaptureIn, setNextCaptureIn] = useState(null);

  // Sync across component instances if mounted in both compact & full view
  useEffect(() => {
    const handleSync = () => {
      const m = loadStoredString(STORAGE_KEYS.mode, 'stream');
      const r = loadStoredString(STORAGE_KEYS.resolution, '720p');
      const f = loadStoredNumber(STORAGE_KEYS.frames, 1);
      const s = loadStoredNumber(STORAGE_KEYS.seconds, 5);
      setModeState(m);
      if (CAMERA_RESOLUTIONS[r]) setResolutionState(r);
      setSnapshotFramesState(f);
      setSnapshotSecondsState(s);
    };

    window.addEventListener(SETTINGS_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const setMode = useCallback((newMode) => {
    const val = newMode === 'snapshot' ? 'snapshot' : 'stream';
    setModeState(val);
    persist(STORAGE_KEYS.mode, val);
    if (val === 'snapshot') {
      setSnapshotKey(Date.now());
      setLastCaptureAt(Date.now());
    }
  }, []);

  const setResolution = useCallback((newRes) => {
    const val = CAMERA_RESOLUTIONS[newRes] ? newRes : 'auto';
    setResolutionState(val);
    persist(STORAGE_KEYS.resolution, val);
  }, []);

  const setSnapshotConfig = useCallback(({ frames, seconds }) => {
    const validFrames = Math.max(1, Math.min(60, Math.floor(Number(frames) || 1)));
    const validSeconds = Math.max(1, Math.min(3600, Math.floor(Number(seconds) || 1)));
    setSnapshotFramesState(validFrames);
    setSnapshotSecondsState(validSeconds);
    persist(STORAGE_KEYS.frames, validFrames);
    persist(STORAGE_KEYS.seconds, validSeconds);
    setSnapshotKey(Date.now());
    setLastCaptureAt(Date.now());
  }, []);

  const triggerSnapshot = useCallback(() => {
    const now = Date.now();
    setSnapshotKey(now);
    setLastCaptureAt(now);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // Interval in milliseconds between frame captures
  const intervalMs = Math.max(250, Math.round((snapshotSeconds * 1000) / Math.max(1, snapshotFrames)));
  const nextTargetRef = useRef(Date.now() + intervalMs);

  // Interval timer for snapshot mode
  useEffect(() => {
    if (mode !== 'snapshot' || isPaused) {
      setNextCaptureIn(null);
      return undefined;
    }

    nextTargetRef.current = Date.now() + intervalMs;
    setNextCaptureIn(Math.ceil(intervalMs / 1000));

    // Update countdown every 200ms
    const countdownInterval = setInterval(() => {
      const remainingMs = Math.max(0, nextTargetRef.current - Date.now());
      setNextCaptureIn(Math.max(1, Math.ceil(remainingMs / 1000)));
    }, 200);

    const captureInterval = setInterval(() => {
      const now = Date.now();
      setSnapshotKey(now);
      setLastCaptureAt(now);
      nextTargetRef.current = now + intervalMs;
      setNextCaptureIn(Math.ceil(intervalMs / 1000));
    }, intervalMs);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(captureInterval);
    };
  }, [mode, isPaused, intervalMs]);

  // Download the current snapshot
  const downloadSnapshot = useCallback(async () => {
    const url = buildCameraUrl({
      baseUrl,
      mode: 'snapshot',
      topic,
      resolution,
      cacheKey: Date.now(),
    });
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = objUrl;
      a.download = `amr-camera-${resolution}-${ts}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      // Fallback: open snapshot in new window if direct blob download fails due to CORS
      window.open(url, '_blank');
    }
  }, [baseUrl, topic, resolution]);

  return {
    mode,
    setMode,
    resolution,
    setResolution,
    resolutions: CAMERA_RESOLUTIONS,
    snapshotFrames,
    snapshotSeconds,
    setSnapshotConfig,
    isPaused,
    togglePause,
    snapshotKey,
    triggerSnapshot,
    lastCaptureAt,
    nextCaptureIn,
    intervalMs,
    downloadSnapshot,
    streamUrl: buildCameraUrl({ baseUrl, mode: 'stream', topic, resolution }),
    snapshotUrl: buildCameraUrl({ baseUrl, mode: 'snapshot', topic, resolution, cacheKey: snapshotKey }),
  };
}
