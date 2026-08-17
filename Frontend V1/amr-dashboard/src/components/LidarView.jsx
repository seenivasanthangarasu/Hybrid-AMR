import { useEffect, useRef } from 'react';
import useLaserScan from '../hooks/useLaserScan.js';
import NoDataBadge from './NoDataBadge.jsx';

// Safety zone: rectangle in front of robot, in meters (robot-frame: +x forward)
const ZONE_WIDTH_M = 0.8; // +/- across robot
const ZONE_DEPTH_M = 1.2; // forward distance

function pointInZone(x, y) {
  return x > 0 && x < ZONE_DEPTH_M && Math.abs(y) < ZONE_WIDTH_M / 2;
}

export default function LidarView({ compact = false }) {
  const { hasData, points } = useLaserScan();
  const canvasRef = useRef(null);

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
    ctx.strokeStyle = 'rgba(36,48,67,0.6)';
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

    ctx.fillStyle = intrusion ? 'rgba(255,77,94,0.25)' : 'rgba(245,166,35,0.18)';
    ctx.strokeStyle = intrusion ? '#ff4d5e' : '#f5a623';
    ctx.lineWidth = 2;
    ctx.fillRect(zx0, zy0, zw, zh);
    ctx.strokeRect(zx0, zy0, zw, zh);

    // scan points
    ctx.fillStyle = '#3ddcff';
    points.forEach((p) => {
      const sx = cx + p.y * scale * -1;
      const sy = cy - p.x * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, compact ? 1.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // robot marker
    ctx.fillStyle = '#eef2f8';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [hasData, points, compact]);

  const intrusion = points.some((p) => pointInZone(p.x, p.y));

  return (
    <div className="relative h-full w-full bg-deck-900">
      <canvas ref={canvasRef} className="h-full w-full" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <NoDataBadge label="NO DATA — /scan" />
        </div>
      )}
      {hasData && !compact && (
        <div
          className={`pointer-events-none absolute right-3 top-3 rounded px-2 py-1 font-mono text-[11px] font-semibold ${
            intrusion ? 'bg-signal-red/20 text-signal-red' : 'bg-signal-amber/15 text-signal-amber'
          }`}
        >
          {intrusion ? 'SAFETY ZONE BREACH' : 'SAFETY ZONE CLEAR'}
        </div>
      )}
    </div>
  );
}
