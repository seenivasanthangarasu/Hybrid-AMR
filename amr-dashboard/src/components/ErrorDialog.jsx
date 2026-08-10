import Dialog from './ui/Dialog.jsx';
import SignalDot from './ui/SignalDot.jsx';
import { toneFor } from './ui/signalTones.js';

/**
 * Renders one error-catalog entry as a dialog: what is true, why it happens,
 * and what to do — in that order, because an operator reads top-down under
 * pressure. Never invents detail; everything shown comes from the catalog, so
 * the dialog, the inline badge, and the reference page always agree.
 *
 * `context` adds the specific instance detail (e.g. which topic/view), which
 * the catalog entry itself is deliberately generic about.
 */
function Section({ label, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <h3 className="data-label mb-1">{label}</h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 font-mono text-[11px] leading-relaxed text-ink-mid">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-low" aria-hidden="true" />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ErrorDialog({ error, open, onClose, context, actions }) {
  if (!error) return null;
  const tone = toneFor(error.tone);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={error.title}
      subtitle={`${error.code} · ${error.severity}${context ? ` · ${context}` : ''}`}
      icon={
        // Static classes only — Tailwind's JIT scans source text, so a class
        // assembled at runtime (`${tone.dot}/15`) would never be generated. The
        // tone colour comes from SignalDot, which uses whole class names.
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deck-800 ring-1 ring-deck-line">
          <SignalDot tone={error.tone} pulse={error.tone === 'critical'} />
        </span>
      }
      footer={
        <>
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-deck-800 px-3 py-1.5 font-display text-[11px] font-bold tracking-wider text-ink-high ring-1 ring-deck-line transition-colors hover:bg-deck-700"
          >
            DISMISS
          </button>
        </>
      }
    >
      <p className={`font-mono text-[11px] leading-relaxed ${tone.text}`}>{error.summary}</p>

      {error.blocking && (
        <p
          className="mt-2 rounded border border-signal-red/30 bg-signal-red/10 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-signal-red"
          role="note"
        >
          Commands cannot reach the robot in this state. Use the physical emergency stop if the robot must be
          stopped now.
        </p>
      )}

      <Section label="Likely causes" items={error.causes} />
      <Section label="What to do" items={error.remedies} />
    </Dialog>
  );
}
