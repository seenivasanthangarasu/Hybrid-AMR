import SignalDot from './SignalDot.jsx';
import { toneFor } from './signalTones.js';
import { formatAge } from '../../utils/freshness.js';

const LABELS = { LIVE: 'LIVE', STALE: 'STALE', NO_DATA: 'NO DATA' };

/**
 * Compact freshness indicator (spec REQ-17): a tone dot plus a short label,
 * e.g. "● LIVE", "● STALE 8s", "○ NO DATA". Takes the object returned by
 * classifyFreshness. `dotOnly` renders just the dot (for tight corners).
 */
export default function FreshnessBadge({ freshness, dotOnly = false, className = '' }) {
  if (!freshness) return null;
  const { state, tone, ageSec } = freshness;
  const t = toneFor(tone);
  const label = LABELS[state] ?? state;
  const age = state === 'STALE' && ageSec != null ? ` ${formatAge(ageSec)}` : '';

  if (dotOnly) {
    return <SignalDot tone={tone} pulse={state === 'LIVE'} className={className} />;
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <SignalDot tone={tone} pulse={state === 'LIVE'} />
      <span className={`font-mono text-[9px] font-semibold tracking-wider ${t.text}`}>
        {label}
        {age}
      </span>
    </span>
  );
}
