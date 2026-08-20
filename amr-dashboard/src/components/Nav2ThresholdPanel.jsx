import { useCallback, useEffect, useState } from 'react';
import Nav2ParameterService, { Nav2ParameterError } from '../services/Nav2ParameterService.js';
import { NAV2_THRESHOLDS, inRange } from '../config/nav2Thresholds.js';
import CommandFeedback from './CommandFeedback.jsx';
import PanelHeader from './ui/PanelHeader.jsx';
import { ERRORS } from '../errors/catalog.js';

const DISABLED_REASON = 'Disconnected — parameter tuning unavailable';

/**
 * Nav2ThresholdPanel — one row per curated threshold (data-handling-nav2-tasks.md
 * REQ-B2), reading/writing through Nav2ParameterService's gatekeeper contract.
 *
 * Nav2 is not deployed anywhere yet (docs/robot-repo-tasks.md), so this panel
 * never pre-fills a row with its safe default as if it were a live reading —
 * the input starts empty with the default shown only as a *placeholder*, and
 * only a real GetParameters response ever populates `liveValue`. APPLY only
 * ever reports SENT_UNCONFIRMED on success (never "confirmed"), same as
 * every other command path in this dashboard (REQ-01/REQ-02 precedent).
 */
function initialRows() {
  return Object.fromEntries(NAV2_THRESHOLDS.map((t) => [t.id, { value: '', liveValue: null, status: null }]));
}

export default function Nav2ThresholdPanel({ connectionStatus }) {
  const [rows, setRows] = useState(initialRows);
  const [unavailable, setUnavailable] = useState(false);
  const disabled = connectionStatus !== 'connected';

  const refresh = useCallback(async () => {
    if (disabled) return;
    try {
      const values = await Nav2ParameterService.getParameters(NAV2_THRESHOLDS.map((t) => t.id));
      setUnavailable(values.size === 0);
      setRows((prev) => {
        const next = { ...prev };
        for (const t of NAV2_THRESHOLDS) {
          if (!values.has(t.id)) continue;
          const v = values.get(t.id);
          next[t.id] = { ...next[t.id], value: String(v), liveValue: v };
        }
        return next;
      });
    } catch {
      setUnavailable(true);
    }
  }, [disabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function updateValue(id, value) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], value } }));
  }

  async function apply(threshold) {
    const row = rows[threshold.id];
    const parsed = Number(row.value);

    if (row.value.trim() === '' || !inRange(threshold, parsed)) {
      setRows((prev) => ({
        ...prev,
        [threshold.id]: {
          ...prev[threshold.id],
          status: {
            state: 'FAILED',
            label: threshold.label,
            at: new Date(),
            detail: `must be ${threshold.min}–${threshold.max} ${threshold.unit}`,
          },
        },
      }));
      return; // rejected client-side — no service call made
    }

    setRows((prev) => ({
      ...prev,
      [threshold.id]: { ...prev[threshold.id], status: { state: 'SENDING', label: threshold.label, at: new Date() } },
    }));
    try {
      await Nav2ParameterService.setParameter(threshold.id, parsed);
      setRows((prev) => ({
        ...prev,
        [threshold.id]: {
          ...prev[threshold.id],
          liveValue: parsed,
          status: { state: 'SENT_UNCONFIRMED', label: threshold.label, at: new Date() },
        },
      }));
    } catch (err) {
      const detail = err instanceof Nav2ParameterError && err.code === 'REJECTED' ? err.message : 'no response';
      setRows((prev) => ({
        ...prev,
        [threshold.id]: { ...prev[threshold.id], status: { state: 'FAILED', label: threshold.label, at: new Date(), detail } },
      }));
    }
  }

  return (
    <div>
      <PanelHeader
        title="NAV2 THRESHOLD TUNING"
        right={
          !disabled && (
            <button
              type="button"
              onClick={refresh}
              className="font-mono text-[10px] text-ink-low transition-colors hover:text-signal-cyan"
            >
              REFRESH
            </button>
          )
        }
      />

      {disabled && (
        <p
          id="nav2-disabled-reason"
          className="mb-2 font-mono text-[10px] text-signal-red"
          role="status"
          aria-live="polite"
        >
          {DISABLED_REASON.toUpperCase()}
        </p>
      )}

      {!disabled && unavailable && (
        <div
          className="mb-3 rounded-md border border-signal-amber/40 bg-signal-amber/10 p-2 font-mono text-[10px] text-signal-amber"
          role="alert"
        >
          {ERRORS.NAV2_UNAVAILABLE.title} — see docs/robot-repo-tasks.md. Inputs below show shipped safe
          defaults as placeholders only, not live readings.
        </div>
      )}

      <ul className="space-y-2">
        {NAV2_THRESHOLDS.map((t) => {
          const row = rows[t.id];
          const applyDisabled = disabled || row.value.trim() === '';
          return (
            <li key={t.id} className="rounded border border-deck-line bg-deck-900/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] font-semibold text-ink-high">{t.label}</p>
                  <p className="font-mono text-[9px] text-ink-low">
                    {t.id} · {row.liveValue !== null ? `LIVE ${row.liveValue} ${t.unit}` : 'NO LIVE VALUE'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={row.value}
                    placeholder={String(t.default)}
                    disabled={disabled}
                    onChange={(e) => updateValue(t.id, e.target.value)}
                    aria-label={`${t.label} (${t.unit}, ${t.min} to ${t.max})`}
                    className="w-20 rounded border border-deck-line bg-deck-950 px-1.5 py-1 font-mono text-[11px] text-ink-high disabled:opacity-40"
                  />
                  <span
                    title={disabled ? DISABLED_REASON : undefined}
                    className={applyDisabled ? 'cursor-not-allowed' : ''}
                  >
                    <button
                      type="button"
                      disabled={applyDisabled}
                      aria-disabled={applyDisabled}
                      aria-describedby={disabled ? 'nav2-disabled-reason' : undefined}
                      onClick={() => apply(t)}
                      className={`rounded bg-signal-cyan/15 px-2 py-1 font-display text-[10px] font-bold tracking-wider text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25 disabled:cursor-not-allowed disabled:opacity-40 ${
                        applyDisabled ? 'pointer-events-none' : ''
                      }`}
                    >
                      APPLY
                    </button>
                  </span>
                </div>
              </div>
              <CommandFeedback status={row.status} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
