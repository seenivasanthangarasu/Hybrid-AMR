import { useCallback, useEffect, useState } from 'react';

/**
 * useLayout — persistent, operator-editable dashboard layout.
 *
 * Holds the react-grid-layout item geometry for every panel and mirrors it to
 * localStorage so a rearranged workspace survives reloads. `reset()` restores
 * the shipped default. The panel *set* is fixed (DEFAULT_LAYOUT ids); only
 * position/size are editable, and unknown/missing ids are reconciled on load
 * so adding a panel in a future build doesn't strand a saved layout.
 */
const STORAGE_KEY = 'amr-layout-v1';

// 12-col grid, 12 rows tall by default so it fills one screen (DashboardGrid
// derives rowHeight from the container height). Mirrors the original layout:
// big main view + right-rail previews, telemetry/controls along the bottom.
export const DEFAULT_LAYOUT = [
  { i: 'main', x: 0, y: 0, w: 9, h: 8, minW: 4, minH: 4 },
  { i: 'status', x: 0, y: 8, w: 3, h: 4, minW: 2, minH: 3 },
  { i: 'mission', x: 3, y: 8, w: 3, h: 4, minW: 2, minH: 3 },
  { i: 'control', x: 6, y: 8, w: 3, h: 4, minW: 2, minH: 3 },
  { i: 'gps', x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'lidar', x: 9, y: 3, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'camera', x: 9, y: 6, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'urdf', x: 9, y: 9, w: 3, h: 3, minW: 2, minH: 2 },
];
// GNSS Quality and Nav2 Threshold Tuning are NOT grid panels — both are
// occasional-use diagnostic/tuning views, opened as full-view overlays from
// the Sidebar (GnssQualityPage/Nav2ThresholdPage) instead of requiring a
// scroll below the one-screen fold to reach.

const PANEL_IDS = DEFAULT_LAYOUT.map((p) => p.i);

function clone(layout) {
  return layout.map((p) => ({ ...p }));
}

const COLS = 12;

// Force one stored panel back into a sane cell. A layout that was saved by an
// older build, hand-edited, or written while the grid was mid-gesture can carry
// NaN/absent numbers or an off-grid x/w — which react-grid-layout renders as an
// invisible or unreachable panel. Clamping here means a bad stored value costs
// the operator a nudged panel, never a missing one. (Overlaps don't need fixing:
// the grid's vertical compaction resolves those on mount.)
function sanitize(def, s) {
  // Only a real finite number counts as a stored value. Coercing instead (`+v`)
  // would turn null/''/booleans into 0 and silently shrink a panel to its
  // minimum rather than restoring the shipped size.
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback);
  const minW = def.minW ?? 1;
  const minH = def.minH ?? 1;
  const w = Math.min(COLS, Math.max(minW, num(s.w, def.w)));
  const h = Math.max(minH, num(s.h, def.h));
  const x = Math.min(COLS - w, Math.max(0, num(s.x, def.x)));
  const y = Math.max(0, num(s.y, def.y));
  return { ...def, x, y, w, h };
}

// Keep only known panels and backfill any missing ones from the default, so a
// stored layout stays valid across builds that add/remove panels — and clamp
// whatever survives so a corrupt entry can't strand a panel off-grid.
function reconcile(saved) {
  if (!Array.isArray(saved)) return clone(DEFAULT_LAYOUT);
  const byId = new Map(saved.filter((p) => p && PANEL_IDS.includes(p.i)).map((p) => [p.i, p]));
  return DEFAULT_LAYOUT.map((def) => {
    const s = byId.get(def.i);
    return s ? sanitize(def, s) : { ...def };
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? reconcile(JSON.parse(raw)) : clone(DEFAULT_LAYOUT);
  } catch {
    return clone(DEFAULT_LAYOUT);
  }
}

export default function useLayout() {
  const [layout, setLayout] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* storage unavailable — layout stays in-memory only */
    }
  }, [layout]);

  const reset = useCallback(() => setLayout(clone(DEFAULT_LAYOUT)), []);

  return { layout, setLayout, reset };
}
