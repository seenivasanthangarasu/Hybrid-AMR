import SignalDot from './SignalDot.jsx';
import { toneFor } from './signalTones.js';

/**
 * Dot + label rendered in a consistent tone. Used for connection status,
 * telemetry freshness, and anywhere a state needs a labelled indicator so
 * the same state reads identically across the UI (spec REQ-16).
 */
export default function SignalChip({ tone = 'idle', label, pulse = false, className = '' }) {
  const t = toneFor(tone);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <SignalDot tone={tone} pulse={pulse} />
      <span className={`font-mono text-[11px] font-semibold tracking-wider ${t.text}`}>{label}</span>
    </span>
  );
}
