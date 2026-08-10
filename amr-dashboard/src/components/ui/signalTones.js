/**
 * One state vocabulary for the whole dashboard (spec REQ-16 seamlessness).
 * Every status dot/chip — header connection, mode, telemetry freshness,
 * command feedback — maps to one of these tones so a given color always
 * means the same thing wherever it appears.
 */
export const TONES = {
  live: { dot: 'bg-signal-green', text: 'text-signal-green' },
  warn: { dot: 'bg-signal-amber', text: 'text-signal-amber' },
  critical: { dot: 'bg-signal-red', text: 'text-signal-red' },
  idle: { dot: 'bg-ink-low', text: 'text-ink-low' },
  stale: { dot: 'bg-signal-amber/70', text: 'text-signal-amber/80' },
  info: { dot: 'bg-signal-cyan', text: 'text-signal-cyan' },
};

export function toneFor(key) {
  return TONES[key] ?? TONES.idle;
}
