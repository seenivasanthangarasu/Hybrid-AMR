import SignalDot from './ui/SignalDot.jsx';
import { toneFor } from './ui/signalTones.js';

/**
 * CommandFeedback
 * Renders the outcome of the last operator command using the shared signal
 * tones (spec REQ-16) so command state reads the same as every other status.
 * There is currently no robot-side ack for any command topic (see
 * docs/remediation/spec.md REQ-01), so SENT_UNCONFIRMED is the honest terminal
 * state on success — this component must never render copy implying the robot
 * acted.
 */
const STATE_META = {
  SENDING: { tone: 'info', label: (label) => `Sending ${label}…` },
  SENT_UNCONFIRMED: {
    tone: 'warn',
    label: (label) => `${label} sent — unconfirmed (no robot ack)`,
  },
  FAILED: {
    tone: 'critical',
    label: (label, detail) => `${label} failed${detail ? ` — ${detail}` : ''}`,
  },
};

export default function CommandFeedback({ status }) {
  if (!status) return null;
  const { state, label, at, detail } = status;
  const meta = STATE_META[state] ?? STATE_META.SENDING;
  const tone = toneFor(meta.tone);

  return (
    <p
      className={`mt-2 flex items-center gap-1.5 font-mono text-[10px] ${tone.text}`}
      role="status"
      aria-live="polite"
    >
      <SignalDot tone={meta.tone} pulse={state === 'SENDING'} />
      <span>
        {meta.label(label, detail)}
        {at && ` — ${at.toLocaleTimeString([], { hour12: false })}`}
      </span>
    </p>
  );
}
