import { useEffect, useState } from 'react';
import DataFallback from './DataFallback.jsx';

const VIDEO_SERVER_URL = import.meta.env.VITE_WEB_VIDEO_URL || 'http://localhost:8080';
const CAMERA_TOPIC = '/camera/camera/color/image_raw';
const CAMERA_STREAM = `${VIDEO_SERVER_URL}/stream?topic=${CAMERA_TOPIC}`;
const RETRY_MS = 3000;

/**
 * CameraView renders the web_video_server MJPEG stream. Fallback is driven by
 * React state (spec REQ-20) — no getElementById/classList DOM poking, no
 * shared element id (the old duplicate id="camera-no-data" collided between
 * the main and compact instances), and it recovers automatically when the
 * stream returns instead of hiding the <img> permanently on first error.
 */
export default function CameraView({ compact = false }) {
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // While the stream is down, periodically re-request it so the view recovers
  // on its own when the camera comes back — without reloading the page.
  useEffect(() => {
    if (!errored) return undefined;
    const id = setInterval(() => setReloadKey((k) => k + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [errored]);

  // Cache-bust on retry so the browser re-fetches rather than reusing the
  // failed connection; key= remounts the <img> to force a fresh request.
  const src = reloadKey === 0 ? CAMERA_STREAM : `${CAMERA_STREAM}&_r=${reloadKey}`;

  return (
    <div className="relative h-full w-full bg-deck-900">
      <img
        key={reloadKey}
        src={src}
        alt="Live camera stream"
        className={`h-full w-full object-cover ${errored ? 'invisible' : ''}`}
        onError={() => setErrored(true)}
        onLoad={() => setErrored(false)}
      />

      {errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <DataFallback topic={CAMERA_TOPIC} label="NO CAMERA STREAM" tone="idle" />
        </div>
      )}

      {!compact && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] text-ink-mid">
          {CAMERA_TOPIC}
        </div>
      )}
    </div>
  );
}
