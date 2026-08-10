import { useEffect, useRef } from 'react';
import useLaserScan from '../hooks/useLaserScan.js';
import useTheme from '../hooks/useTheme.js';
import useNow from '../hooks/useNow.js';
import { themeColor } from '../utils/themeColor.js';
import { classifyFreshness } from '../utils/freshness.js';
import DataFallback from './DataFallback.jsx';
import FreshnessBadge from './ui/FreshnessBadge.jsx';

// Safety zone: rectangle in front of robot, in meters (robot-frame: +x forward)
const ZONE_WIDTH_M = 0.8; // +/- across robot
const ZONE_DEPTH_M = 1.2; // forward distance

function pointInZone(x, y) {
  return x > 0 && x < ZONE_DEPTH_M && Math.abs(y) < ZONE_WIDTH_M / 2;
}

export default function LidarView({ compact = false }) {
  const { hasData, hasEverData, lastReceivedAt, points } = useLaserScan();
  const { theme } = useTheme();
  const now = useNow(1000);
  const canvasRef = useRef(null);

  const freshness = classifyFreshness({ hasData, hasEverData, lastReceivedAt }, now);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = canvas;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!hasData) return;

    const cx = w / 2;
    const cy = h / 2;
    const maxRange = Math.max(...points.map((p) => p.range), 3);
    const scale = (Math.min(w, h) / 2 - 20) / maxRange;

    // grid rings
    ctx.strokeStyle = themeColor('deck-line', 0.6);
    ctx.lineWidth = 1;
    for (let r = 1; r <= Math.ceil(maxRange); r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    let intrusion = false;

    // safety zone rectangle (robot-frame x forward -> screen up = -y)
    const zx0 = cx - (ZONE_WIDTH_M / 2) * scale;
    const zy0 = cy - ZONE_DEPTH_M * scale;
    const zw = ZONE_WIDTH_M * scale;
    const zh = ZONE_DEPTH_M * scale;

    for (const p of points) {
      if (pointInZone(p.x, p.y)) {
        intrusion = true;
        break;
      }
    }

    ctx.fillStyle = intrusion ? themeColor('signal-red', 0.25) : themeColor('signal-amber', 0.18);
    ctx.strokeStyle = intrusion ? themeColor('signal-red') : themeColor('signal-amber');
    ctx.lineWidth = 2;
    ctx.fillRect(zx0, zy0, zw, zh);
    ctx.strokeRect(zx0, zy0, zw, zh);

    // scan points
    ctx.fillStyle = themeColor('signal-cyan');
    points.forEach((p) => {
      const sx = cx + p.y * scale * -1;
      const sy = cy - p.x * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, compact ? 1.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // robot marker
    ctx.fillStyle = themeColor('ink-high');
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [hasData, points, compact, theme]);

  const intrusion = points.some((p) => pointInZone(p.x, p.y));

  return (
    <div className="relative h-full w-full bg-deck-900">
      <canvas ref={canvasRef} className="h-full w-full" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <DataFallback topic="/scan" hasEverData={hasEverData} lastReceivedAt={lastReceivedAt} />
        </div>
      )}
      {hasData && !compact && (
        // Display-only proximity monitor: this draws a zone and flags points
        // inside it for the operator's eye — the robot does NOT act on it (no
        // robot-side safety-stop is wired). Wording avoids "SAFETY ZONE
        // BREACH", which implied an enforced safety function (spec F4 honesty).
        <div
          title="Display-only proximity monitor — the robot does not stop on this"
          className={`pointer-events-none absolute right-3 top-3 flex items-baseline gap-1 rounded px-2 py-1 font-mono text-[11px] font-semibold ${
            intrusion ? 'bg-signal-red/20 text-signal-red' : 'bg-signal-amber/15 text-signal-amber'
          }`}
        >
          {intrusion ? 'OBJECT IN ZONE' : 'ZONE CLEAR'}
          <span className="text-[8px] font-normal uppercase tracking-wider opacity-70">monitor</span>
        </div>
      )}
      {hasData && !compact && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded bg-deck-900/80 px-2 py-1">
          <FreshnessBadge freshness={freshness} />
          <span className="font-mono text-[9px] tracking-wider text-ink-low">/scan</span>
        </div>
      )}
    </div>
  );
}
