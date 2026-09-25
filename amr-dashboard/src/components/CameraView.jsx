import { useEffect, useState, useMemo } from 'react';
import DataFallback from './DataFallback.jsx';
import {
  DEFAULT_CAMERA_TOPIC,
  CAMERA_NAME,
  CAMERA_SPECS,
  getCameraStreamUrl,
  getCameraViewerUrl,
  getVideoServerUrl,
} from '../config/endpoints.js';
import useBackendApi from '../hooks/useBackendApi.js';

const RETRY_MS = 3000;

/**
 * CameraView
 * ----------
 * Renders the Logitech C270 HD 720p Web Camera stream via web_video_server MJPEG.
 * Topic: /camera/color/image_raw (sensor_msgs/msg/Image)
 * Endpoint: /stream?topic=/camera/color/image_raw&quality=75&default_transport=raw&framerate=30
 * Viewer Fallback: /stream_viewer?topic=/camera/color/image_raw
 */
export default function CameraView({ compact = false, onStreamState }) {
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [quality, setQuality] = useState(75);
  const [framerate, setFramerate] = useState(30);
  const [showSettings, setShowSettings] = useState(false);
  const [useSnapshotMode, setUseSnapshotMode] = useState(false);
  const [toggleMsg, setToggleMsg] = useState(null);

  const { backendConnected, cameraHardware, toggleCamera, loading: backendLoading } = useBackendApi();

  const streamUrl = useMemo(
    () => getCameraStreamUrl({ topic: DEFAULT_CAMERA_TOPIC, quality, framerate, defaultTransport: 'raw' }),
    [quality, framerate],
  );

  const viewerUrl = useMemo(
    () => getCameraViewerUrl(DEFAULT_CAMERA_TOPIC),
    [],
  );

  const snapshotUrl = useMemo(
    () => `${getVideoServerUrl()}/snapshot?topic=${DEFAULT_CAMERA_TOPIC}`,
    [],
  );

  // Report stream status upward to App.jsx
  useEffect(() => {
    onStreamState?.(!errored);
  }, [errored, onStreamState]);

  // Auto-retry polling while stream is down
  useEffect(() => {
    if (!errored) return undefined;
    const id = setInterval(() => setReloadKey((k) => k + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [errored]);

  const activeSrc = useSnapshotMode
    ? `${snapshotUrl}&_snap=${reloadKey}`
    : reloadKey === 0
      ? streamUrl
      : `${streamUrl}&_r=${reloadKey}`;

  const handleToggleMode = async (mode = 'v4l2') => {
    setToggleMsg(`Switching camera to ${mode}...`);
    const res = await toggleCamera(true, mode);
    if (res.status === 'ok' || res.success) {
      setToggleMsg(`Camera active (${mode})`);
      setTimeout(() => {
        setReloadKey((k) => k + 1);
        setToggleMsg(null);
      }, 1500);
    } else {
      setToggleMsg(`Toggle failed: ${res.message || 'unknown error'}`);
      setTimeout(() => setToggleMsg(null), 3500);
    }
  };

  if (compact) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-deck-900">
        <img
          key={reloadKey}
          src={activeSrc}
          alt="Logitech C270 Preview"
          className={`h-full w-full object-cover ${errored ? 'invisible' : ''}`}
          onError={() => setErrored(true)}
          onLoad={() => setErrored(false)}
        />

        {errored && (
          <div className="absolute inset-0 flex items-center justify-center bg-deck-900/90 p-2 text-center">
            <DataFallback topic={DEFAULT_CAMERA_TOPIC} label="NO CAMERA STREAM" tone="idle" />
          </div>
        )}

        {!errored && (
          <div className="pointer-events-none absolute bottom-1 left-1.5 rounded bg-deck-950/80 px-1.5 py-0.5 font-mono text-[9px] text-signal-cyan backdrop-blur-sm">
            720p · {framerate} FPS
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-deck-950 font-mono">
      {/* Top Header Bar for Main View */}
      <div className="z-10 flex shrink-0 items-center justify-between border-b border-deck-line bg-deck-900 px-3 py-1.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${!errored ? 'bg-signal-green shadow-[0_0_8px_#37e29a]' : 'bg-signal-amber animate-pulse'}`} />
          <span className="font-display text-[11px] font-bold tracking-wider text-ink-high">
            {CAMERA_NAME}
          </span>
          <span className="rounded bg-deck-800 px-1.5 py-0.5 text-[9px] text-signal-cyan ring-1 ring-deck-line">
            {CAMERA_SPECS}
          </span>
          {cameraHardware?.physical_camera_connected && (
            <span className="rounded bg-signal-green/15 px-1.5 py-0.5 text-[9px] text-signal-green">
              /dev/amr_camera
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          {toggleMsg && (
            <span className="text-signal-cyan animate-pulse font-bold">{toggleMsg}</span>
          )}

          <button
            type="button"
            onClick={() => setUseSnapshotMode((v) => !v)}
            className={`rounded border px-2 py-0.5 ${useSnapshotMode ? 'border-signal-cyan bg-signal-cyan/20 text-signal-cyan font-bold' : 'border-deck-line bg-deck-800 text-ink-mid hover:text-ink-high'}`}
          >
            {useSnapshotMode ? 'Snapshot Mode' : 'MJPEG Stream'}
          </button>

          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="rounded border border-deck-line bg-deck-800 px-2 py-0.5 text-ink-mid hover:border-signal-cyan hover:text-ink-high"
          >
            {quality}% · {framerate} FPS ⚙
          </button>

          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open raw web_video_server stream viewer in new tab"
            className="rounded border border-deck-line bg-deck-800 px-2 py-0.5 text-ink-mid hover:border-signal-cyan hover:text-signal-cyan"
          >
            Pop-out ↗
          </a>
        </div>
      </div>

      {/* Settings Overlay Drawer */}
      {showSettings && (
        <div className="z-20 flex flex-wrap items-center justify-between border-b border-deck-line bg-deck-900 px-3 py-2 text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-low">QUALITY</span>
              <input
                type="range"
                min="30"
                max="100"
                step="5"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="h-1.5 w-20 accent-signal-cyan cursor-pointer"
              />
              <span className="w-8 text-[10px] text-signal-cyan">{quality}%</span>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-low">FPS</span>
              <select
                value={framerate}
                onChange={(e) => setFramerate(Number(e.target.value))}
                className="rounded border border-deck-line bg-deck-800 px-1.5 py-0.5 text-[10px] text-ink-high"
              >
                <option value="15">15 FPS</option>
                <option value="20">20 FPS</option>
                <option value="30">30 FPS (Default)</option>
              </select>
            </label>
          </div>

          {backendConnected && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={backendLoading}
                onClick={() => handleToggleMode('v4l2')}
                className="rounded bg-signal-cyan/15 px-2 py-1 text-[10px] font-semibold text-signal-cyan hover:bg-signal-cyan/25 disabled:opacity-50"
              >
                Restart V4L2
              </button>
              <button
                type="button"
                disabled={backendLoading}
                onClick={() => handleToggleMode('diagnostic')}
                title="Generates test color bars to verify display pipeline"
                className="rounded border border-signal-amber/40 bg-signal-amber/15 px-2 py-1 text-[10px] font-semibold text-signal-amber hover:bg-signal-amber/25 disabled:opacity-50"
              >
                Test Color Bars
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Video Stream Container */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <img
          key={`${reloadKey}-${useSnapshotMode}`}
          src={activeSrc}
          alt="Logitech C270 Live Camera Stream"
          className={`h-full w-full object-contain ${errored ? 'invisible' : ''}`}
          onError={() => setErrored(true)}
          onLoad={() => setErrored(false)}
        />

        {/* Stream Overlay Details */}
        {!errored && (
          <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2">
            <span className="rounded bg-deck-950/80 px-2 py-0.5 text-[9px] text-signal-green backdrop-blur-sm border border-deck-line">
              ● LIVE
            </span>
            <span className="rounded bg-deck-950/80 px-2 py-0.5 text-[9px] text-ink-mid backdrop-blur-sm border border-deck-line">
              {useSnapshotMode ? 'SNAPSHOT' : `720p · ${framerate} FPS · ${quality}% Q`}
            </span>
          </div>
        )}

        {/* Fallback Screen when Stream is Down */}
        {errored && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-deck-900/95 p-4 text-center">
            <DataFallback
              topic={DEFAULT_CAMERA_TOPIC}
              label="NO LOGITECH C270 CAMERA STREAM"
              tone="idle"
            />
            <p className="max-w-md text-[11px] text-ink-mid">
              Web video server on port 8080 is unreachable or topic <code className="text-signal-cyan">{DEFAULT_CAMERA_TOPIC}</code> is not publishing.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded border border-signal-cyan/50 bg-signal-cyan/15 px-3 py-1 text-[11px] text-signal-cyan hover:bg-signal-cyan/25"
              >
                Retry Stream ↻
              </button>

              <a
                href={viewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-deck-line bg-deck-800 px-3 py-1 text-[11px] text-ink-mid hover:text-ink-high"
              >
                Open Stream Viewer ↗
              </a>

              <a
                href={snapshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-deck-line bg-deck-800 px-3 py-1 text-[11px] text-ink-mid hover:text-ink-high"
              >
                Direct Snapshot ↗
              </a>

              {backendConnected && (
                <button
                  type="button"
                  disabled={backendLoading}
                  onClick={() => handleToggleMode('v4l2')}
                  className="rounded border border-signal-green/40 bg-signal-green/15 px-3 py-1 text-[11px] text-signal-green hover:bg-signal-green/25 disabled:opacity-50"
                >
                  Start V4L2 Camera Node
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Topic Tag for Main View */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] text-ink-mid backdrop-blur-sm border border-deck-line">
          {DEFAULT_CAMERA_TOPIC} · 1280x720 (16:9)
        </div>
      </div>
    </div>
  );
}
