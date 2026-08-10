import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useLayout, { DEFAULT_LAYOUT } from './useLayout.js';

const KEY = 'amr-layout-v1';
const COLS = 12;

function overlappingPairs(layout) {
  const out = [];
  for (let a = 0; a < layout.length; a++) {
    for (let b = a + 1; b < layout.length; b++) {
      const p = layout[a];
      const q = layout[b];
      const xOverlap = p.x < q.x + q.w && q.x < p.x + p.w;
      const yOverlap = p.y < q.y + q.h && q.y < p.y + p.h;
      if (xOverlap && yOverlap) out.push(`${p.i}<->${q.i}`);
    }
  }
  return out;
}

describe('useLayout persistence + sanitizing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the shipped default when nothing is stored', () => {
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(overlappingPairs(result.current.layout)).toEqual([]);
  });

  it('repairs a corrupt stored layout instead of stranding panels', () => {
    // Mirrors the real failure: a panel off-grid, NaN/null geometry, and a
    // panel parked far down the grid. (Overlaps are resolved by the grid's
    // vertical compaction at render time, not here.)
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { i: 'main', x: 0, y: 20, w: 9, h: 8 },
        { i: 'status', x: 0, y: NaN, w: null, h: 4 },
        { i: 'mission', x: 3, y: 8, w: 3, h: 4 },
        { i: 'control', x: 6, y: 8, w: 3, h: 4 },
        { i: 'gps', x: 9, y: 0, w: 3, h: 3 },
        { i: 'lidar', x: 9, y: 3, w: 3, h: 3 },
        { i: 'camera', x: 9, y: 3, w: 3, h: 3 },
        { i: 'urdf', x: 22, y: 9, w: 3, h: 3 }, // off the 12-col grid
      ]),
    );

    const { result } = renderHook(() => useLayout());
    const layout = result.current.layout;

    // Every panel survives — none dropped, none duplicated.
    expect(layout).toHaveLength(DEFAULT_LAYOUT.length);
    expect(layout.map((p) => p.i).sort()).toEqual(DEFAULT_LAYOUT.map((p) => p.i).sort());

    // Everything sits inside the grid with finite geometry.
    for (const p of layout) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.w) && Number.isFinite(p.h)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(COLS);
    }

    // NaN/null geometry restores the shipped size rather than collapsing to 0.
    const status = layout.find((p) => p.i === 'status');
    const statusDefault = DEFAULT_LAYOUT.find((p) => p.i === 'status');
    expect(status.w).toBe(statusDefault.w);
    expect(status.h).toBe(statusDefault.h);

    // The off-grid panel is pulled back into bounds.
    expect(layout.find((p) => p.i === 'urdf').x).toBeLessThanOrEqual(COLS - 3);
  });

  it('backfills a panel missing from an older stored layout', () => {
    localStorage.setItem(KEY, JSON.stringify([{ i: 'main', x: 0, y: 0, w: 9, h: 8 }]));
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout).toHaveLength(DEFAULT_LAYOUT.length);
    expect(result.current.layout.find((p) => p.i === 'camera')).toBeTruthy();
  });

  it('ignores unknown panel ids from a future/edited layout', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([...DEFAULT_LAYOUT, { i: 'ghost-panel', x: 0, y: 0, w: 2, h: 2 }]),
    );
    const { result } = renderHook(() => useLayout());
    expect(result.current.layout.find((p) => p.i === 'ghost-panel')).toBeUndefined();
    expect(result.current.layout).toHaveLength(DEFAULT_LAYOUT.length);
  });
});
