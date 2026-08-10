/**
 * Resolve a theme token (see src/index.css) to a canvas-ready color string.
 * Canvas fillStyle/strokeStyle can't use CSS variables directly, so views that
 * draw to <canvas> read the current computed channels here and re-run their
 * draw effect when the theme changes (pass `theme` from useTheme into deps).
 *
 * @param {string} name  token without the leading `--` (e.g. 'deck-900')
 * @param {number} alpha 0..1 opacity
 */
export function themeColor(name, alpha = 1) {
  if (typeof document === 'undefined') return '#000';
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!channels) return '#000';
  return alpha >= 1 ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
}

/**
 * Same token, returned as an [r, g, b] numeric triplet — for callers that
 * write raw pixels (e.g. canvas ImageData). Falls back to black on failure.
 */
export function themeRGB(name) {
  if (typeof document === 'undefined') return [0, 0, 0];
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const parts = channels.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => !Number.isNaN(n)) ? parts : [0, 0, 0];
}

/**
 * Same token as a `#rrggbb` hex string — for consumers whose color parser
 * predates modern space-separated `rgb()` syntax (e.g. the ROS3D/THREE r89
 * bundle, which rejects `rgb(203 213 225)`).
 */
export function themeHex(name) {
  const [r, g, b] = themeRGB(name);
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
