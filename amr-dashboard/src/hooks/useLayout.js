import { useCallback, useEffect, useState } from 'react';

/**
 * useLayout — persistent, operator-editable dashboard layout.
 *
 * Holds the react-grid-layout item geometry for every panel and mirrors it to
 * localStorage so a rearranged workspace survives reloads. `reset()` restores
 * the shipped default. Panel set adapts to workspace environment (indoor vs outdoor).
 */
const BASE_STORAGE_KEY = 'amr-layout-v3';

// 12-col grid. Rows 0–7: main view + right-rail previews.
// Rows 8–11: four equal telemetry panels (status / mission / control / imu),
// each identical to the others in size.
// Row 12+: URDF widget (below fold, scrolls in on demand).
export const DEFAULT_LAYOUT = [
  { i: 'main',    x: 0,  y: 0,  w: 9, h: 8,  minW: 4, minH: 4 },

  // Right-rail previews: fill rows 0–7 (total h=8) without overlap.
  { i: 'gps',    x: 9,  y: 0,  w: 3, h: 3,  minW: 2, minH: 2 },
  { i: 'lidar',  x: 9,  y: 3,  w: 3, h: 3,  minW: 2, minH: 2 },
  { i: 'camera', x: 9,  y: 6,  w: 3, h: 2,  minW: 2, minH: 2 },

  // Bottom telemetry band — all four panels identical size.
  { i: 'status',  x: 0,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'mission', x: 3,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'control', x: 6,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'imu',     x: 9,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },

  // URDF: below the one-screen fold, scrolls in — no longer competes with IMU.
  { i: 'urdf',   x: 0,  y: 12, w: 3, h: 3,  minW: 2, minH: 2 },
];

export const DEFAULT_INDOOR_LAYOUT = [
  { i: 'main',    x: 0,  y: 0,  w: 9, h: 8,  minW: 4, minH: 4 },

  // Right-rail previews: in indoor mode, GPS is removed. Lidar & camera fill rows 0–7 equally.
  { i: 'lidar',  x: 9,  y: 0,  w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'camera', x: 9,  y: 4,  w: 3, h: 4,  minW: 2, minH: 2 },

  // Bottom telemetry band
  { i: 'status',  x: 0,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'mission', x: 3,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'control', x: 6,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
  { i: 'imu',     x: 9,  y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },

  // URDF below fold
  { i: 'urdf',   x: 0,  y: 12, w: 3, h: 3,  minW: 2, minH: 2 },
];

function clone(layout) {
  return layout.map((p) => ({ ...p }));
}

const COLS = 12;

function sanitize(def, s) {
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback);
  const minW = def.minW ?? 1;
  const minH = def.minH ?? 1;
  const w = Math.min(COLS, Math.max(minW, num(s.w, def.w)));
  const h = Math.max(minH, num(s.h, def.h));
  const x = Math.min(COLS - w, Math.max(0, num(s.x, def.x)));
  const y = Math.max(0, num(s.y, def.y));
  return { ...def, x, y, w, h };
}

function reconcile(saved, defaultLayout) {
  if (!Array.isArray(saved)) return clone(defaultLayout);
  const panelIds = defaultLayout.map((p) => p.i);
  const byId = new Map(saved.filter((p) => p && panelIds.includes(p.i)).map((p) => [p.i, p]));
  return defaultLayout.map((def) => {
    const s = byId.get(def.i);
    return s ? sanitize(def, s) : { ...def };
  });
}

export default function useLayout(environment = null) {
  const isIndoor = environment === 'indoor';
  const defaultLayout = isIndoor ? DEFAULT_INDOOR_LAYOUT : DEFAULT_LAYOUT;
  const storageKey = isIndoor ? `${BASE_STORAGE_KEY}-indoor` : BASE_STORAGE_KEY;

  const [layout, setLayout] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return reconcile(JSON.parse(raw), defaultLayout);

      // Check legacy key for migration
      if (isIndoor) {
        const legacy = localStorage.getItem(BASE_STORAGE_KEY);
        if (legacy) {
          // Reconcile against indoor layout to strip GPS cleanly
          return reconcile(JSON.parse(legacy), defaultLayout);
        }
      }
      return clone(defaultLayout);
    } catch {
      return clone(defaultLayout);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* storage unavailable — layout stays in-memory only */
    }
  }, [layout, storageKey]);

  const reset = useCallback(() => setLayout(clone(defaultLayout)), [defaultLayout]);

  return { layout, setLayout, reset };
}
