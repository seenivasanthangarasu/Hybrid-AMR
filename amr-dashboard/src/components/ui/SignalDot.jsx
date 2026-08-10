import { toneFor } from './signalTones.js';

/**
 * A single status dot. `tone` is a key from signalTones (live/warn/critical/
 * idle/stale/info). `pulse` adds the slow pulse for attention-worthy states.
 */
export default function SignalDot({ tone = 'idle', pulse = false, className = '' }) {
  const t = toneFor(tone);
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${t.dot} ${pulse ? 'animate-pulse-slow' : ''} ${className}`}
    />
  );
}
