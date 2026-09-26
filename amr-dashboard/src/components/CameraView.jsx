import { useEffect, useState, useMemo } from 'react';
import DataFallback from './DataFallback.jsx';
import useCameraSettings, {
  CAMERA_RESOLUTIONS,
  SNAPSHOT_PRESETS,
  CAMERA_TOPIC,
} from '../hooks/useCameraSettings.js';

const RETRY_MS = 3000;

export default function CameraView({ compact = false, onStreamState }) {
  const {
    mode,
    setMode,
    resolution,
    setResolution,
    snapshotFrames,
    snapshotSeconds,
    setSnapshotConfig,
    isPaused,
    togglePause,
    triggerSnapshot,
    downloadSnapshot,
    lastCaptureAt,
    nextCaptureIn,
    streamUrl,
    snapshotUrl,
  } = useCameraSettings();

  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCustomInterval, setShowCustomInterval] = useState(false);
  const [customFrames, setCustomFrames] = useState(snapshotFrames);
  const [customSeconds, setCustomSeconds] = useState(snapshotSeconds);

  // Sync custom input fields if snapshot config changed from outside
  useEffect(() => {
    setCustomFrames(snapshotFrames);
    setCustomSeconds(snapshotSeconds);
  }, [snapshotFrames, snapshotSeconds]);

  // Report stream health upward
  useEffect(() => {
    onStreamState?.(!errored);
  }, [errored, onStreamState]);

  // Periodic retry when connection fails
  useEffect(() => {
    if (!errored) return undefined;
    const id = setInterval(() => setReloadKey((k) => k + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [errored]);

  // Active image source
  const currentSrc = useMemo(() => {
    if (mode === 'snapshot') {
      return reloadKey === 0 ? snapshotUrl : `${snapshotUrl}&_r=${reloadKey}`;
    }
    return reloadKey === 0 ? streamUrl : `${streamUrl}&_r=${reloadKey}`;
  }, [mode, streamUrl, snapshotUrl, reloadKey]);

  // Format last capture time
  const formattedLastCapture = useMemo(() => {
    if (!lastCaptureAt) return null;
    const d = new Date(lastCaptureAt);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastCaptureAt]);

  const activeRes = CAMERA_RESOLUTIONS[resolution] || CAMERA_RESOLUTIONS.auto;

  const handleCustomSubmit = (e) => {
    e?.preventDefault?.();
    setSnapshotConfig({ frames: customFrames, seconds: customSeconds });
    setShowCustomInterval(false);
  };

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden bg-deck-900 select-none">
      {/* Top Controls Overlay */}
      <div
        className={`pointer-events-auto z-10 flex flex-wrap items-center justify-between gap-2 border-b border-deck-line/60 bg-deck-950/85 px-3 py-1.5 backdrop-blur-sm transition-opacity duration-200 ${
          compact ? 'px-2 py-1 text-[10px]' : 'text-xs'
        }`}
        onClick={(e) => compact && e.stopPropagation()}
      >
        {/* Left: Mode Toggle */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded border border-deck-line bg-deck-900 p-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('stream');
              }}
              className={`flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                mode === 'stream'
                  ? 'bg-signal-cyan/20 text-signal-cyan shadow-sm'
                  : 'text-ink-low hover:text-ink-mid'
              }`}
              title="Continuous live MJPEG stream"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  mode === 'stream' && !errored ? 'animate-pulse bg-signal-cyan' : 'bg-ink-low'
                }`}
              />
              LIVE STREAM
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('snapshot');
              }}
              className={`flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                mode === 'snapshot'
                  ? 'bg-signal-amber/20 text-signal-amber shadow-sm'
                  : 'text-ink-low hover:text-ink-mid'
              }`}
              title="Interval snapshot mode (reduces bandwidth)"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              SNAPSHOT
            </button>
          </div>

          {/* Snapshot mode quick info */}
          {mode === 'snapshot' && !compact && (
            <span className="font-mono text-[11px] text-signal-amber">
              {snapshotFrames} frame{snapshotFrames > 1 ? 's' : ''} / {snapshotSeconds}s
              {isPaused ? ' (PAUSED)' : nextCaptureIn ? ` · next in ${nextCaptureIn}s` : ''}
            </span>
          )}
        </div>

        {/* Center / Right: Resolution Picker & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Resolution Selector */}
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-low">RES:</span>
            <div className="inline-flex rounded border border-deck-line bg-deck-900 p-0.5">
              {Object.values(CAMERA_RESOLUTIONS).map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setResolution(res.id);
                  }}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                    resolution === res.id
                      ? 'bg-deck-700 text-ink-high'
                      : 'text-ink-low hover:text-ink-mid'
                  }`}
                  title={
                    res.width ? `${res.label} (${res.width}x${res.height})` : 'Auto (Camera native resolution)'
                  }
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* Snapshot controls (Capture Now, Pause, Download) */}
          {mode === 'snapshot' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerSnapshot();
                }}
                className="flex items-center gap-1 rounded border border-deck-line bg-deck-800 px-2 py-0.5 font-mono text-[10px] text-ink-mid hover:border-ink-low hover:text-ink-high"
                title="Capture a single frame immediately"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Snap
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePause();
                }}
                className={`rounded border border-deck-line px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  isPaused
                    ? 'bg-signal-amber/20 text-signal-amber border-signal-amber/40'
                    : 'bg-deck-800 text-ink-mid hover:text-ink-high'
                }`}
                title={isPaused ? 'Resume periodic snapshots' : 'Pause periodic snapshots'}
              >
                {isPaused ? '▶' : '⏸'}
              </button>

              {!compact && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSnapshot();
                  }}
                  className="rounded border border-deck-line bg-deck-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-mid hover:border-ink-low hover:text-ink-high"
                  title="Download current snapshot as JPEG"
                >
                  ↓ Save
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Snapshot Interval Selection Bar (Full View Only) */}
      {mode === 'snapshot' && !compact && (
        <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-deck-line/40 bg-deck-950/70 px-3 py-1 font-mono text-[11px] text-ink-mid backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-ink-low">Rate:</span>
            {SNAPSHOT_PRESETS.map((p) => {
              const active =
                !showCustomInterval &&
                snapshotFrames === p.frames &&
                snapshotSeconds === p.seconds;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setShowCustomInterval(false);
                    setSnapshotConfig({ frames: p.frames, seconds: p.seconds });
                  }}
                  className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                    active
                      ? 'border-signal-amber bg-signal-amber/15 font-semibold text-signal-amber'
                      : 'border-deck-line bg-deck-900 text-ink-low hover:text-ink-mid'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowCustomInterval((v) => !v)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                showCustomInterval
                  ? 'border-signal-cyan bg-signal-cyan/15 font-semibold text-signal-cyan'
                  : 'border-deck-line bg-deck-900 text-ink-low hover:text-ink-mid'
              }`}
            >
              Custom...
            </button>
          </div>

          {showCustomInterval && (
            <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="60"
                value={customFrames}
                onChange={(e) => setCustomFrames(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-12 rounded border border-deck-line bg-deck-900 px-1 py-0.5 text-center text-[10px] text-ink-high"
                title="Number of frames"
              />
              <span className="text-[10px] text-ink-low">frame(s) in</span>
              <input
                type="number"
                min="1"
                max="3600"
                value={customSeconds}
                onChange={(e) => setCustomSeconds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 rounded border border-deck-line bg-deck-900 px-1 py-0.5 text-center text-[10px] text-ink-high"
                title="Seconds"
              />
              <span className="text-[10px] text-ink-low">sec</span>
              <button
                type="submit"
                className="rounded bg-signal-cyan/20 px-2 py-0.5 text-[10px] font-semibold text-signal-cyan hover:bg-signal-cyan/30"
              >
                Set
              </button>
            </form>
          )}

          {formattedLastCapture && (
            <div className="text-[10px] text-ink-low">
              Last frame: <span className="text-ink-mid">{formattedLastCapture}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Stream / Snapshot Image */}
      <div className="relative flex-1 overflow-hidden">
        <img
          key={`${mode}-${resolution}-${reloadKey}`}
          src={currentSrc}
          alt={mode === 'snapshot' ? 'Camera snapshot' : 'Live camera stream'}
          className={`h-full w-full object-contain ${errored ? 'invisible' : ''}`}
          onError={() => setErrored(true)}
          onLoad={() => setErrored(false)}
        />

        {/* Fallback overlay when server down / no stream */}
        {errored && (
          <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
            <DataFallback
              topic={CAMERA_TOPIC}
              label={mode === 'snapshot' ? 'NO CAMERA SNAPSHOT' : 'NO CAMERA STREAM'}
              tone="idle"
            />
          </div>
        )}

        {/* Bottom Metadata Badges */}
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5">
          <div className="rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] text-ink-mid backdrop-blur-xs">
            {CAMERA_TOPIC}
          </div>
          {mode === 'snapshot' && (
            <div className="rounded bg-signal-amber/15 border border-signal-amber/30 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-signal-amber">
              SNAPSHOT · {snapshotFrames}F/{snapshotSeconds}S
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 font-mono text-[10px]">
          <div className="rounded bg-deck-900/80 px-2 py-1 text-ink-mid backdrop-blur-xs">
            {activeRes.badge} {activeRes.width ? `(${activeRes.width}×${activeRes.height})` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
