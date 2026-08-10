import { useState } from 'react';
import Dialog from './ui/Dialog.jsx';
import ErrorDialog from './ErrorDialog.jsx';
import SignalDot from './ui/SignalDot.jsx';
import { toneFor } from './ui/signalTones.js';
import { errorsByCategory } from '../errors/catalog.js';

/**
 * Error reference — the operator-facing index of every fault the dashboard can
 * report, grouped by category, with the exact dialog each one raises.
 *
 * It exists so a fault is never encountered cold: an operator can read what
 * OFFLINE / NO SIGNAL / STALE actually mean (and how they differ) before a
 * shift rather than during an incident, and an engineer can see the full set
 * without grepping the source. Every card is generated from
 * `src/errors/catalog.js`, so this page cannot drift from what the UI raises.
 */
function ErrorCard({ error, onOpen }) {
  const tone = toneFor(error.tone);
  return (
    <li className="rounded-md border border-deck-line bg-deck-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SignalDot tone={error.tone} />
            <h4 className="font-display text-[11px] font-bold tracking-wider text-ink-high">{error.title}</h4>
          </div>
          <p className="mt-0.5 font-mono text-[9px] tracking-wider text-ink-low">
            {error.code} · {error.severity}
            {error.blocking && <span className="ml-1 text-signal-red">· BLOCKS COMMANDS</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(error)}
          title={`Preview the ${error.title} dialog`}
          className={`shrink-0 rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider ring-1 ring-deck-line transition-colors hover:bg-deck-800 ${tone.text}`}
        >
          VIEW DIALOG
        </button>
      </div>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-mid">{error.summary}</p>
    </li>
  );
}

export default function ErrorReference({ open, onClose }) {
  const [preview, setPreview] = useState(null);
  const groups = errorsByCategory();

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="xl"
        title="ERROR REFERENCE"
        subtitle="Every fault state this dashboard can report — what it means, why it happens, and what to do"
      >
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="mb-2 border-b border-deck-line pb-1 font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">
                {group.label.toUpperCase()}
                <span className="ml-2 font-mono text-[9px] font-normal text-ink-low">
                  {group.errors.length} {group.errors.length === 1 ? 'state' : 'states'}
                </span>
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.errors.map((error) => (
                  <ErrorCard key={error.code} error={error} onOpen={setPreview} />
                ))}
              </ul>
            </section>
          ))}

          <p className="border-t border-deck-line pt-3 font-mono text-[10px] leading-relaxed text-ink-low">
            Panels show these same states inline as badges (LIVE · STALE · NO SIGNAL · OFFLINE). This page and
            those badges are generated from one catalog, so they cannot disagree.
          </p>
        </div>
      </Dialog>

      {/* Preview of the real dialog an operator would see for that fault. */}
      <ErrorDialog
        error={preview}
        open={!!preview}
        onClose={() => setPreview(null)}
        context="reference preview"
      />
    </>
  );
}
