import { useEffect, useState } from 'react';

const STATUS_STYLES = {
  connected: { color: 'bg-signal-green', text: 'text-signal-green', label: 'ROSBRIDGE LINKED' },
  connecting: { color: 'bg-signal-amber animate-pulse-slow', text: 'text-signal-amber', label: 'CONNECTING' },
  error: { color: 'bg-signal-red', text: 'text-signal-red', label: 'CONNECTION ERROR' },
  closed: { color: 'bg-signal-red', text: 'text-signal-red', label: 'LINK CLOSED' },
  disconnected: { color: 'bg-ink-low', text: 'text-ink-low', label: 'DISCONNECTED' },
};

export default function Header({ connectionStatus, mode, isModeDefault }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = STATUS_STYLES[connectionStatus] || STATUS_STYLES.disconnected;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-deck-line bg-deck-900 px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-signal-cyan/40 bg-signal-cyan/10">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-signal-cyan" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="4" y="9" width="16" height="10" rx="2" />
            <path d="M9 9V6a3 3 0 016 0v3" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
          </svg>
        </div>
        <h1 className="font-display text-sm font-bold tracking-[0.18em] text-ink-high">
          HYBRID AMR COMMAND CENTER
        </h1>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="data-label">MODE</span>
          <span
            className={`rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-wide ${
              mode === 'INDOOR' ? 'bg-signal-violet/15 text-signal-violet' : 'bg-signal-cyan/15 text-signal-cyan'
            }`}
          >
            {mode}
            {isModeDefault && <span className="ml-1 text-[9px] text-ink-low">(default)</span>}
          </span>
        </div>

        <div className="data-value text-xs text-ink-mid">
          {now.toLocaleTimeString([], { hour12: false })}
          <span className="ml-2 text-ink-low">{now.toLocaleDateString()}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${s.color}`} />
          <span className={`font-mono text-[11px] font-semibold tracking-wider ${s.text}`}>{s.label}</span>
        </div>
      </div>
    </header>
  );
}
