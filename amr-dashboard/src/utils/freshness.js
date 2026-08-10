/**
 * Freshness classification (spec REQ-17). Turns a topic hook's timing signals
 * into one of three explicit states so telemetry never shows a last-known
 * value as if it were live:
 *   LIVE    — fresh data arriving
 *   STALE   — was received, but not within the topic's staleness window
 *             (still shows the last value, dimmed, with its age)
 *   NO_DATA — never received
 *
 * `hasData` is live-only (the hook's fresh flag). `hasEverData` distinguishes
 * "went quiet" (STALE) from "never connected" (NO_DATA).
 */
export function classifyFreshness({ hasData, hasEverData, lastReceivedAt } = {}, now = Date.now()) {
  if (hasData) return { state: 'LIVE', tone: 'live', ageSec: 0 };
  if (hasEverData) {
    const ageSec = lastReceivedAt ? Math.max(0, Math.round((now - lastReceivedAt) / 1000)) : null;
    return { state: 'STALE', tone: 'stale', ageSec };
  }
  return { state: 'NO_DATA', tone: 'idle', ageSec: null };
}

/** Compact age label, e.g. "8s" / "3m" / "1h". */
export function formatAge(ageSec) {
  if (ageSec == null) return '';
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`;
  return `${Math.floor(ageSec / 3600)}h`;
}
