import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import useLaserScan from '../hooks/useLaserScan.js';
import useTheme from '../hooks/useTheme.js';
import useNow from '../hooks/useNow.js';
import { themeColor } from '../utils/themeColor.js';
import { classifyFreshness } from '../utils/freshness.js';
import {
  CRITICAL_PROXIMITY_M,
  WARNING_PROXIMITY_M,
} from '../utils/proximitySector.js';
import {
  isAlarmSoundEnabled,
  setAlarmSoundEnabled,
  updateProximityAlarmSound,
  stopAlarmSound,
} from '../utils/proximityAlarmSound.js';
import DataFallback from './DataFallback.jsx';
import FreshnessBadge from './ui/FreshnessBadge.jsx';

// Forward corridor dimensions in meters (robot frame: +x fwd, +y left)
const CORRIDOR_WIDTH_M = 0.70;
const CORRIDOR_LENGTH_M = 1.20;

function safeFillText(ctx, text, x, y) {
  if (typeof ctx.fillText === 'function') {
    ctx.fillText(text, x, y);
  }
}

function safeStrokeRect(ctx, x, y, w, h) {
  if (typeof ctx.strokeRect === 'function') {
    ctx.strokeRect(x, y, w, h);
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawChassisRect(ctx, x, y, w, h, r = 0) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else if (typeof ctx.rect === 'function') {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
}

const RANGE_PRESETS = [
  { id: '1.5m', value: 1.5, label: '1.5m' },
  { id: '3m', value: 3.0, label: '3m' },
  { id: '5m', value: 5.0, label: '5m' },
  { id: '10m', value: 10.0, label: '10m' },
  { id: 'auto', value: null, label: 'AUTO' },
];

export default function LidarView({ compact = false }) {
  const { hasData, hasEverData, lastReceivedAt, points, minRange, nearestPoint, proximityStatus, raw } = useLaserScan();
  const { theme } = useTheme();
  const now = useNow(1000);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const [rangePreset, setRangePreset] = useState('5m');
  const [soundEnabled, setSoundState] = useState(() => isAlarmSoundEnabled());
  const [showZones, setShowZones] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Measure and adapt to container resizing dynamically across all screen sizes
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => {
      const { clientWidth, clientHeight } = el;
      setDimensions((prev) => {
        if (prev.width === clientWidth && prev.height === clientHeight) return prev;
        return { width: clientWidth, height: clientHeight };
      });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
  }, []);

  // Effective dimensions with safe fallback for test/SSR environments
  const effectiveWidth = dimensions.width || (compact ? 280 : 600);
  const effectiveHeight = dimensions.height || (compact ? 220 : 400);

  // Responsive breakpoints based on actual container bounds
  const isNarrow = effectiveWidth < 340;
  const isTiny = effectiveWidth < 240;
  const isShort = effectiveHeight < 220;
  const isUltraShort = effectiveHeight < 150;

  // Sync sound state across components
  useEffect(() => {
    const handleSoundChange = (e) => {
      setSoundState(e.detail.enabled);
    };
    window.addEventListener('amr-lidar-sound-changed', handleSoundChange);
    return () => window.removeEventListener('amr-lidar-sound-changed', handleSoundChange);
  }, []);

  // Update acoustic proximity alarm when live data arrives
  useEffect(() => {
    if (hasData && points.length > 0) {
      updateProximityAlarmSound(proximityStatus, minRange);
    } else {
      stopAlarmSound();
    }
    return () => {
      stopAlarmSound();
    };
  }, [hasData, points.length, proximityStatus, minRange]);

  const toggleSound = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const next = !soundEnabled;
    setSoundState(next);
    setAlarmSoundEnabled(next);
  }, [soundEnabled]);

  const cycleRange = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setRangePreset((current) => {
      const ids = RANGE_PRESETS.map((p) => p.id);
      const idx = ids.indexOf(current);
      const nextIdx = (idx + 1) % ids.length;
      return ids[nextIdx];
    });
  }, []);

  const freshness = classifyFreshness({ hasData, hasEverData, lastReceivedAt }, now);

  // Check if any scan point falls into the forward clearance corridor
  const isCorridorIntrusion = useMemo(() => {
    if (!points || points.length === 0) return false;
    return points.some(
      (p) => p.x > 0 && p.x < CORRIDOR_LENGTH_M && Math.abs(p.y) < CORRIDOR_WIDTH_M / 2
    );
  }, [points]);

  // Compute effective view radius in meters
  const effectiveMaxRange = useMemo(() => {
    const foundPreset = RANGE_PRESETS.find((p) => p.id === rangePreset);
    if (foundPreset && foundPreset.value !== null) {
      return foundPreset.value;
    }
    // Auto scaling
    if (!points || points.length === 0) return 5;
    let maxR = 3;
    for (let i = 0; i < points.length; i++) {
      if (points[i].range > maxR) maxR = points[i].range;
    }
    return Math.min(Math.max(maxR * 1.15, 3), 20);
  }, [rangePreset, points]);

  // Render high-precision radar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const w = canvas.clientWidth || effectiveWidth;
    const h = canvas.clientHeight || effectiveHeight;
    if (w === 0 || h === 0) return;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!hasData) return;

    const cx = w / 2;
    const cy = h / 2;

    // Dynamic proportional padding so radar never gets squished or clipped
    const pad = Math.max(6, Math.min(24, Math.min(w, h) * 0.07));
    const maxRadius = Math.max(14, Math.min(cx, cy) - pad);
    const scale = maxRadius / effectiveMaxRange;

    // ── 1. Radar background & Polar Grid ──────────────────────────
    if (showGrid) {
      // Background vignette
      if (typeof ctx.createRadialGradient === 'function') {
        const bgGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, maxRadius);
        bgGrad.addColorStop(0, themeColor('deck-900', 0.95));
        bgGrad.addColorStop(1, themeColor('deck-950', 0.98));
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = themeColor('deck-950');
      }
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
      ctx.fill();

      // Step interval for concentric range rings
      let ringStep = 1.0;
      if (effectiveMaxRange <= 2.0) ringStep = 0.5;
      else if (effectiveMaxRange <= 5.0) ringStep = 1.0;
      else if (effectiveMaxRange <= 10.0) ringStep = 2.0;
      else ringStep = 5.0;

      ctx.lineWidth = 1;
      for (let r = ringStep; r <= effectiveMaxRange + 0.01; r += ringStep) {
        const ringPx = r * scale;
        if (ringPx > maxRadius + 1) break;

        ctx.beginPath();
        ctx.arc(cx, cy, ringPx, 0, Math.PI * 2);
        ctx.strokeStyle = themeColor('deck-line', r + ringStep > effectiveMaxRange ? 0.6 : 0.28);
        ctx.stroke();

        // Meter distance labels (only if radius is sufficiently large to be readable)
        if (maxRadius >= 45 && scale * ringStep >= 18) {
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillStyle = themeColor('ink-low', 0.6);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          safeFillText(ctx, `${r.toFixed(1)}m`, cx + 4, cy - ringPx - 2);
        }
      }

      // Compass & Radial axes (Crosshairs)
      ctx.strokeStyle = themeColor('deck-line', 0.35);
      ctx.lineWidth = 1;

      // Vertical (FWD / REV)
      ctx.beginPath();
      ctx.moveTo(cx, cy - maxRadius);
      ctx.lineTo(cx, cy + maxRadius);
      ctx.stroke();

      // Horizontal (LEFT / RIGHT)
      ctx.beginPath();
      ctx.moveTo(cx - maxRadius, cy);
      ctx.lineTo(cx + maxRadius, cy);
      ctx.stroke();

      // 45-degree diagonal guide lines (dashed)
      ctx.save();
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([2, 5]);
      }
      ctx.strokeStyle = themeColor('deck-line', 0.2);
      const diag = maxRadius * 0.7071;
      ctx.beginPath();
      ctx.moveTo(cx - diag, cy - diag);
      ctx.lineTo(cx + diag, cy + diag);
      ctx.moveTo(cx - diag, cy + diag);
      ctx.lineTo(cx + diag, cy - diag);
      ctx.stroke();
      ctx.restore();

      // Cardinal direction markings (draw when radius is sufficient)
      if (maxRadius >= 40) {
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = themeColor('ink-mid', 0.7);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        safeFillText(ctx, 'FWD', cx, cy - maxRadius - 2);

        ctx.textBaseline = 'top';
        safeFillText(ctx, 'REV', cx, cy + maxRadius + 2);

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        safeFillText(ctx, 'L', cx - maxRadius - 3, cy);

        ctx.textAlign = 'left';
        safeFillText(ctx, 'R', cx + maxRadius + 3, cy);
      }
    }

    // ── 2. Safety Zones & Clearance Corridor ──────────────────────
    if (showZones) {
      // Critical collision buffer zone (< 0.50m)
      const critPx = CRITICAL_PROXIMITY_M * scale;
      const isCrit = proximityStatus === 'CRITICAL';
      ctx.beginPath();
      ctx.arc(cx, cy, critPx, 0, Math.PI * 2);
      ctx.fillStyle = isCrit ? themeColor('signal-red', 0.22) : themeColor('signal-red', 0.05);
      ctx.strokeStyle = isCrit ? themeColor('signal-red', 0.9) : themeColor('signal-red', 0.35);
      ctx.lineWidth = isCrit ? 2 : 1;
      ctx.fill();
      ctx.stroke();

      // Caution warning zone (< 1.20m)
      const warnPx = WARNING_PROXIMITY_M * scale;
      const isWarn = proximityStatus === 'WARNING';
      ctx.beginPath();
      ctx.arc(cx, cy, warnPx, 0, Math.PI * 2);
      ctx.fillStyle = isWarn ? themeColor('signal-amber', 0.12) : themeColor('signal-amber', 0.03);
      ctx.strokeStyle = isWarn ? themeColor('signal-amber', 0.8) : themeColor('signal-amber', 0.25);
      ctx.lineWidth = isWarn ? 1.5 : 1;
      ctx.stroke();

      // Forward Clearance Corridor
      const cw = CORRIDOR_WIDTH_M * scale;
      const cl = CORRIDOR_LENGTH_M * scale;
      const x0 = cx - cw / 2;
      const y0 = cy - cl;

      ctx.fillStyle = isCorridorIntrusion
        ? themeColor('signal-amber', 0.18)
        : themeColor('signal-cyan', 0.04);
      ctx.strokeStyle = isCorridorIntrusion
        ? themeColor('signal-amber', 0.85)
        : themeColor('signal-cyan', 0.25);
      ctx.lineWidth = isCorridorIntrusion ? 1.5 : 1;
      ctx.fillRect(x0, y0, cw, cl);
      safeStrokeRect(ctx, x0, y0, cw, cl);
    }

    // ── 3. Robot Footprint & Orientation Chevron ──────────────────
    // Simulated AMR chassis dimensions (scaled dynamically with maxRadius bounds)
    const robW = Math.max(6, Math.min(maxRadius * 0.38, Math.max(0.55 * scale, 8)));
    const robL = Math.max(8, Math.min(maxRadius * 0.52, Math.max(0.70 * scale, 12)));

    // Chassis body
    ctx.save();
    ctx.fillStyle = themeColor('deck-700', 0.85);
    ctx.strokeStyle = themeColor('signal-cyan', 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    drawChassisRect(ctx, cx - robW / 2, cy - robL / 2, robW, robL, 2.5);
    ctx.fill();
    ctx.stroke();

    // Wheels / Side tracks
    ctx.fillStyle = themeColor('deck-line');
    const trackW = Math.max(robW * 0.16, 2);
    const trackL = robL * 0.65;
    ctx.fillRect(cx - robW / 2 - trackW / 2, cy - trackL / 2, trackW, trackL);
    ctx.fillRect(cx + robW / 2 - trackW / 2, cy - trackL / 2, trackW, trackL);

    // Forward Heading Chevron (Triangle pointing up)
    ctx.fillStyle = themeColor('signal-cyan');
    ctx.beginPath();
    const chH = Math.max(robL * 0.28, 4);
    ctx.moveTo(cx, cy - robL / 2 + 1.5);
    ctx.lineTo(cx - chH * 0.7, cy - robL / 2 + chH + 1.5);
    ctx.lineTo(cx + chH * 0.7, cy - robL / 2 + chH + 1.5);
    ctx.closePath();
    ctx.fill();

    // Center Origin Dot
    ctx.fillStyle = themeColor('ink-high');
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 4. Laser Scan Points (Proximity Heatmap) ──────────────────
    const ptCritRadius = maxRadius < 60 ? 1.6 : compact ? 2.0 : 2.6;
    const ptWarnRadius = maxRadius < 60 ? 1.2 : compact ? 1.6 : 2.0;
    const ptSafeRadius = maxRadius < 60 ? 0.9 : compact ? 1.2 : 1.5;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // Convert REP-103 to Screen: +x forward -> -Y, +y left -> -X
      const sx = cx - p.y * scale;
      const sy = cy - p.x * scale;

      // Skip points outside visible boundary
      const distFromCenter = Math.hypot(sx - cx, sy - cy);
      if (distFromCenter > maxRadius + 5) continue;

      ctx.beginPath();
      if (p.range <= CRITICAL_PROXIMITY_M) {
        // Critical threat point: glowing halo + red core
        ctx.fillStyle = themeColor('signal-red', 0.35);
        ctx.arc(sx, sy, ptCritRadius + 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = themeColor('signal-red');
        ctx.arc(sx, sy, ptCritRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.range <= WARNING_PROXIMITY_M) {
        // Warning caution point: bright amber
        ctx.fillStyle = themeColor('signal-amber');
        ctx.arc(sx, sy, ptWarnRadius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Safe distant point: cyan
        ctx.fillStyle = themeColor('signal-cyan', 0.85);
        ctx.arc(sx, sy, ptSafeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 5. Closest Obstacle Vector & Target Reticle ───────────────
    if (nearestPoint && nearestPoint.range <= effectiveMaxRange) {
      const nx = cx - nearestPoint.y * scale;
      const ny = cy - nearestPoint.x * scale;

      const isThreat = nearestPoint.range <= WARNING_PROXIMITY_M;
      const reticleColor = nearestPoint.range <= CRITICAL_PROXIMITY_M
        ? themeColor('signal-red')
        : nearestPoint.range <= WARNING_PROXIMITY_M
          ? themeColor('signal-amber')
          : themeColor('signal-cyan', 0.6);

      // Dashed hazard vector from robot center to obstacle
      ctx.save();
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([3, 3]);
      }
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = isThreat ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      // Pulsing crosshair / target reticle at obstacle
      const reticleRadius = Math.max(3, Math.min(compact ? 5 : 7, maxRadius * 0.12));
      const tick = Math.max(2, reticleRadius * 0.6);

      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(nx, ny, reticleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshair tick marks
      ctx.beginPath();
      ctx.moveTo(nx - tick - reticleRadius, ny);
      ctx.lineTo(nx - 2, ny);
      ctx.moveTo(nx + 2, ny);
      ctx.lineTo(nx + tick + reticleRadius, ny);
      ctx.moveTo(nx, ny - tick - reticleRadius);
      ctx.lineTo(nx, ny - 2);
      ctx.moveTo(nx, ny + 2);
      ctx.lineTo(nx, ny + tick + reticleRadius);
      ctx.stroke();

      // Obstacle distance tag (draw when radius allows)
      if (maxRadius >= 35 && (!compact || isThreat)) {
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = reticleColor;
        ctx.textAlign = nx > cx ? 'left' : 'right';
        ctx.textBaseline = ny > cy ? 'top' : 'bottom';
        const offset = nx > cx ? 6 : -6;
        safeFillText(ctx, `${nearestPoint.range.toFixed(2)}m`, nx + offset, ny);
      }
      ctx.restore();
    }
  }, [
    hasData,
    points,
    nearestPoint,
    effectiveMaxRange,
    proximityStatus,
    isCorridorIntrusion,
    compact,
    theme,
    showZones,
    showGrid,
    dimensions,
    effectiveWidth,
    effectiveHeight,
  ]);

  // Visual container alarm state
  const containerAlarmClasses = useMemo(() => {
    if (!hasData) return '';
    if (proximityStatus === 'CRITICAL') {
      return 'ring-2 ring-signal-red/80 shadow-[0_0_20px_rgba(255,77,94,0.35)]';
    }
    if (proximityStatus === 'WARNING') {
      return 'ring-1 ring-signal-amber/70 shadow-[0_0_12px_rgba(245,166,35,0.2)]';
    }
    return '';
  }, [hasData, proximityStatus]);

  return (
    <div
      data-testid="lidar-view-root"
      className={`relative flex h-full w-full flex-col overflow-hidden bg-deck-950 transition-[box-shadow,ring] duration-300 ${containerAlarmClasses}`}
    >
      {/* ── Top Alarm & Status HUD (Adapts to Container Width) ───── */}
      <div
        className="pointer-events-auto z-10 flex h-8 shrink-0 items-center justify-between gap-1.5 border-b border-deck-line/60 bg-deck-900/90 px-2 text-xs backdrop-blur-sm"
        onClick={(e) => compact && e.stopPropagation()}
      >
        {/* Left: Alarm Banner & Nearest Telemetry */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {proximityStatus === 'CRITICAL' && (
            <div
              data-testid="lidar-alarm-critical"
              title={`CRITICAL COLLISION RISK: ${minRange?.toFixed(2)}m [${nearestPoint?.sector || 'UNKNOWN'}]`}
              className="flex items-center gap-1.5 rounded bg-signal-red/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-signal-red animate-pulse truncate"
            >
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-signal-red" />
              <span className="truncate">CRITICAL: {minRange?.toFixed(2)}m</span>
              {nearestPoint?.sector && (
                <span className={isTiny ? 'hidden' : 'inline opacity-90'}>[{nearestPoint.sector}]</span>
              )}
            </div>
          )}

          {proximityStatus === 'WARNING' && (
            <div
              data-testid="lidar-alarm-warning"
              title={`PROXIMITY CAUTION: ${minRange?.toFixed(2)}m [${nearestPoint?.sector || 'UNKNOWN'}]`}
              className="flex items-center gap-1.5 rounded bg-signal-amber/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-signal-amber truncate"
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-signal-amber" />
              <span className="truncate">CAUTION: {minRange?.toFixed(2)}m</span>
              {nearestPoint?.sector && (
                <span className={isTiny ? 'hidden' : 'inline opacity-90'}>[{nearestPoint.sector}]</span>
              )}
            </div>
          )}

          {proximityStatus === 'CLEAR' && (
            <div
              data-testid="lidar-alarm-clear"
              title={`Proximity Clear · Nearest: ${minRange ? minRange.toFixed(2) + 'm' : 'None'}`}
              className="flex items-center gap-1.5 rounded bg-signal-green/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-signal-green truncate"
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-signal-green" />
              <span>CLEAR</span>
              {minRange && !isTiny && <span className="text-ink-low truncate">· {minRange.toFixed(2)}m</span>}
            </div>
          )}

          {isCorridorIntrusion && !isNarrow && !compact && (
            <span
              title="Obstacle detected directly in the robot's forward driving envelope"
              className="inline-flex shrink-0 items-center rounded bg-signal-amber/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-signal-amber"
            >
              CORRIDOR BLOCKED
            </span>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Audio Alarm Toggle */}
          <div
            role="button"
            tabIndex={0}
            onClick={toggleSound}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSound(e)}
            title={soundEnabled ? 'Acoustic Proximity Alarm ON (Click to Mute)' : 'Proximity Alarm Muted (Click to Enable)'}
            data-testid="lidar-sound-toggle"
            className={`cursor-pointer flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors select-none shrink-0 ${
              soundEnabled
                ? 'border-signal-cyan/40 bg-signal-cyan/15 text-signal-cyan hover:bg-signal-cyan/25'
                : 'border-deck-line bg-deck-800 text-ink-low hover:text-ink-mid'
            }`}
          >
            <span>{soundEnabled ? '🔊' : '🔇'}</span>
            {!isNarrow && !compact && <span>{soundEnabled ? 'ALARM ON' : 'MUTED'}</span>}
          </div>

          {/* Range Selector: Full bar when wide, compact cycler when narrow */}
          {!isNarrow && !compact ? (
            <div className="inline-flex rounded border border-deck-line bg-deck-800 p-0.5">
              {RANGE_PRESETS.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRangePreset(p.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      setRangePreset(p.id);
                    }
                  }}
                  className={`cursor-pointer px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase transition-colors select-none rounded ${
                    rangePreset === p.id
                      ? 'bg-signal-cyan/25 text-signal-cyan'
                      : 'text-ink-low hover:text-ink-mid'
                  }`}
                >
                  {p.label}
                </div>
              ))}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={cycleRange}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && cycleRange(e)}
              title={`View Range: ${rangePreset.toUpperCase()} (Click to cycle)`}
              data-testid="lidar-range-cycler"
              className="cursor-pointer flex items-center gap-1 rounded border border-deck-line bg-deck-800 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-signal-cyan hover:border-signal-cyan/50 select-none"
            >
              <span>{rangePreset.toUpperCase()}</span>
              <span className="text-[7px] text-ink-low">▼</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Radar Canvas (Tracked via ResizeObserver) ───────── */}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full block" />

        {/* Fallback overlay when no live scan */}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-deck-950/85">
            <DataFallback topic="/scan" hasEverData={hasEverData} lastReceivedAt={lastReceivedAt} />
          </div>
        )}

        {/* Bottom Bar: Telemetry & Controls */}
        {hasData && !isUltraShort && (
          <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-2 overflow-hidden text-[9px]">
            {/* Left: Freshness & telemetry */}
            <div className="flex items-center gap-1.5 rounded bg-deck-900/85 px-1.5 py-0.5 backdrop-blur-sm border border-deck-line/40 truncate">
              <FreshnessBadge freshness={freshness} />
              <span className="font-mono text-ink-low tracking-wider">/scan</span>
              {!isTiny && (
                <>
                  <span className="text-deck-line">|</span>
                  <span className="font-mono tabular-nums text-ink-mid">
                    {points.length} pts
                  </span>
                </>
              )}
              {!isNarrow && !compact && nearestPoint && (
                <>
                  <span className="text-deck-line">|</span>
                  <span className="font-mono tabular-nums text-ink-mid truncate">
                    Closest: <strong className="text-ink-high">{nearestPoint.range.toFixed(2)}m</strong> ({nearestPoint.sector})
                  </span>
                </>
              )}
            </div>

            {/* Right: View toggles (Non-compact & sufficiently wide/tall) */}
            {!compact && !isNarrow && !isShort && (
              <div className="pointer-events-auto flex items-center gap-1 rounded bg-deck-900/85 px-1.5 py-0.5 backdrop-blur-sm border border-deck-line/40 shrink-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowZones((z) => !z)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowZones((z) => !z)}
                  className={`cursor-pointer px-1 py-0.5 font-mono rounded select-none ${
                    showZones ? 'bg-signal-amber/20 text-signal-amber' : 'text-ink-low hover:text-ink-mid'
                  }`}
                >
                  ZONES: {showZones ? 'ON' : 'OFF'}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowGrid((g) => !g)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowGrid((g) => !g)}
                  className={`cursor-pointer px-1 py-0.5 font-mono rounded select-none ${
                    showGrid ? 'bg-signal-cyan/20 text-signal-cyan' : 'text-ink-low hover:text-ink-mid'
                  }`}
                >
                  GRID: {showGrid ? 'ON' : 'OFF'}
                </div>
                {raw && raw.range_max && (
                  <span className="font-mono text-ink-low pl-1">
                    Max {raw.range_max.toFixed(0)}m
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
