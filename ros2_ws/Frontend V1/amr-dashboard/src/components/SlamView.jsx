import { useEffect, useRef } from 'react';
import useOccupancyGrid from '../hooks/useOccupancyGrid.js';
import useTF from '../hooks/useTF.js';
import useLaserScan from '../hooks/useLaserScan.js';
import NoDataBadge from './NoDataBadge.jsx';

export default function SlamView() {
  const grid = useOccupancyGrid();
  const { transform, hasData: hasPose } = useTF({ frameId: 'base_link', fixedFrame: 'map' });
  const { hasData: hasScan, points } = useLaserScan();
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
    ctx.fillStyle = '#0e131c';
    ctx.fillRect(0, 0, w, h);

    if (!grid.hasData) return;

    const { width, height, resolution, origin, data } = grid;
    const scale = Math.min(w / width, h / height);
    const offX = (w - width * scale) / 2;
    const offY = (h - height * scale) / 2;

    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      let color;
      if (v === -1) color = [14, 19, 28]; // unknown
      else if (v === 0) color = [27, 36, 51]; // free
      else color = [159, 176, 198]; // occupied, scaled by v could be added

      const px = i % width;
      const py = height - 1 - Math.floor(i / width); // flip row order (map origin bottom-left)
      const idx = (py * width + px) * 4;
      imgData.data[idx] = color[0];
      imgData.data[idx + 1] = color[1];
      imgData.data[idx + 2] = color[2];
      imgData.data[idx + 3] = 255;
    }

    // draw to an offscreen canvas at native resolution, then scale up
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    off.getContext('2d').putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, offX, offY, width * scale, height * scale);

    // world -> screen helper using map origin/resolution
    const originX = origin?.position?.x ?? 0;
    const originY = origin?.position?.y ?? 0;
    const worldToScreen = (wx, wy) => {
      const gx = (wx - originX) / resolution;
      const gy = (wy - originY) / resolution;
      const sx = offX + gx * scale;
      const sy = offY + (height - gy) * scale;
      return [sx, sy];
    };

    // robot pose + heading from TF
    if (hasPose && transform?.translation) {
      const { x, y } = transform.translation;
      const [rx, ry] = worldToScreen(x, y);

      let yaw = 0;
      const q = transform.rotation;
      if (q) {
        const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
        const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
        yaw = Math.atan2(siny_cosp, cosy_cosp);
      }

      // live laser scan transformed into the robot's pose on the map
      if (hasScan) {
        ctx.fillStyle = 'rgba(61,220,255,0.65)';
        points.forEach((p) => {
          const wx = x + p.x * Math.cos(yaw) - p.y * Math.sin(yaw);
          const wy = y + p.x * Math.sin(yaw) + p.y * Math.cos(yaw);
          const [sx, sy] = worldToScreen(wx, wy);
          ctx.beginPath();
          ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-yaw);
      ctx.fillStyle = '#37e29a';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [grid, hasPose, transform, hasScan, points]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      {!grid.hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <NoDataBadge label="NO DATA — /map" />
        </div>
      )}
      {grid.hasData && !hasPose && (
        <div className="absolute bottom-3 left-3 rounded bg-deck-900/80 px-2 py-1 font-mono text-[11px] text-signal-amber">
          NO POSE — /tf
        </div>
      )}
    </div>
  );
}
