import { useEffect, useState } from 'react';
import useTheme from '../hooks/useTheme.js';
import SignalChip from './ui/SignalChip.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

function HamburgerButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      title="Menu — layout, panels, data & backups, error reference"
      className="flex h-8 w-8 items-center justify-center rounded border border-deck-line text-ink-mid transition-colors hover:border-ink-low hover:text-ink-high"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLight}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className="flex h-7 w-7 items-center justify-center rounded border border-deck-line text-ink-mid transition-colors hover:border-ink-low hover:text-ink-high"
    >
      {isLight ? (
        /* moon — click to go dark */
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      ) : (
        /* sun — click to go light */
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

// Connection status → shared signal tone + label (spec REQ-16: one vocabulary)
const STATUS_SIGNAL = {
  connected: { tone: 'live', label: 'ROSBRIDGE LINKED' },
  connecting: { tone: 'warn', label: 'CONNECTING', pulse: true },
  error: { tone: 'critical', label: 'CONNECTION ERROR' },
  closed: { tone: 'critical', label: 'LINK CLOSED' },
  disconnected: { tone: 'idle', label: 'DISCONNECTED' },
};

// Link is recoverable (spec REQ-20) — surface a Reconnect control instead of
// forcing the operator to reload the page.
const RECOVERABLE = new Set(['error', 'closed', 'disconnected']);

/**
 * Bounded auto-reconnect, made visible. A silent retry would be worse than no
 * retry: the operator cannot tell whether the dashboard is recovering, and
 * cannot tell when it has stopped trying. So the countdown to the next attempt
 * is shown, and running out of attempts is stated outright rather than the
 * indicator simply going quiet.
 */
function RetryIndicator({ retry, now }) {
  if (!retry || retry.attempt === 0) return null;

  if (retry.exhausted) {
    return (
      <SignalChip
        tone="critical"
        label={`AUTO-RETRY GAVE UP (${retry.maxAttempts})`}
        className="whitespace-nowrap"
      />
    );
  }

  const secondsLeft = retry.nextAttemptAt
    ? Math.max(0, Math.ceil((retry.nextAttemptAt - now.getTime()) / 1000))
    : 0;

  return (
    <SignalChip
      tone="warn"
      pulse
      label={`AUTO-RETRY ${retry.attempt}/${retry.maxAttempts} · ${secondsLeft}s`}
      className="whitespace-nowrap"
    />
  );
}

export default function Header({ connectionStatus, mode, isModeDefault, onReconnect, retry, onOpenSidebar }) {
  const [now, setNow] = useState(new Date());
  const workspace = useWorkspace();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = STATUS_SIGNAL[connectionStatus] || STATUS_SIGNAL.disconnected;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-deck-line bg-deck-900 px-5">
      <div className="flex items-center gap-3">
        <HamburgerButton onClick={onOpenSidebar} />
        <div className="flex h-8 w-8 items-center justify-center rounded border border-signal-cyan/40 bg-signal-cyan/10">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-signal-cyan"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect x="4" y="9" width="16" height="10" rx="2" />
            <path d="M9 9V6a3 3 0 016 0v3" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
          </svg>
        </div>
        <h1 className="font-display text-sm font-bold tracking-[0.18em] text-ink-high">
          XTRMBLY COMMAND CENTER
        </h1>
      </div>

      <div className="flex items-center gap-6">
        {workspace.isConfigured ? (
          <div className="flex items-center gap-2">
            <span className="data-label">WORKSPACE</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-wide ${
                  workspace.effectiveEnvironment === 'indoor'
                    ? 'bg-signal-violet/15 text-signal-violet'
                    : 'bg-signal-cyan/15 text-signal-cyan'
                }`}
              >
                {workspace.environment?.toUpperCase()}
                {workspace.environment === 'hybrid' && (
                  <span className="ml-1 text-[9px] text-ink-low">
                    ({workspace.activeSegment?.toUpperCase()})
                  </span>
                )}
                <span className="mx-1 text-ink-low">·</span>
                <span className="text-ink-high">{workspace.operatingMode?.toUpperCase()}</span>
              </span>

              {workspace.environment === 'hybrid' && (
                <button
                  type="button"
                  onClick={() =>
                    workspace.setActiveSegment(
                      workspace.activeSegment === 'indoor' ? 'outdoor' : 'indoor',
                    )
                  }
                  title="Switch active hybrid segment"
                  className="rounded border border-signal-cyan/40 bg-signal-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-signal-cyan hover:bg-signal-cyan/20"
                >
                  TO {workspace.activeSegment === 'indoor' ? 'OUTDOOR' : 'INDOOR'}
                </button>
              )}

              {workspace.isEnvironmentMismatch && (
                <span
                  title={`Robot reports ${workspace.reportedRobotEnvironment} via /robot_mode`}
                  className="rounded border border-signal-amber/40 bg-signal-amber/15 px-1.5 py-0.5 font-mono text-[9px] text-signal-amber"
                >
                  ROBOT: {workspace.reportedRobotEnvironment}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="data-label">MODE</span>
            <span
              className={`rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-wide ${
                mode === 'INDOOR'
                  ? 'bg-signal-violet/15 text-signal-violet'
                  : 'bg-signal-cyan/15 text-signal-cyan'
              }`}
            >
              {mode}
              {isModeDefault && <span className="ml-1 text-[9px] text-ink-low">(default)</span>}
            </span>
          </div>
        )}

        <div className="data-value text-xs text-ink-mid">
          {now.toLocaleTimeString([], { hour12: false })}
          <span className="ml-2 text-ink-low">{now.toLocaleDateString()}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* aria-live so a screen reader announces link-state changes
              (LINKED → LINK CLOSED → …) without the operator watching the
              chip. Polite: connection status is informational, not urgent
              like the e-stop confirm (spec REQ-12). */}
          <span role="status" aria-live="polite" aria-label={`Connection: ${s.label}`}>
            <SignalChip tone={s.tone} label={s.label} pulse={s.pulse} />
          </span>
          {/* Polite too: an automatic retry is progress information, not an
              action the operator must take right now (spec REQ-12). */}
          <span role="status" aria-live="polite">
            <RetryIndicator retry={retry} now={now} />
          </span>
          {onReconnect && RECOVERABLE.has(connectionStatus) && (
            <button
              type="button"
              onClick={onReconnect}
              title={
                retry?.exhausted
                  ? 'Automatic retries are spent — this starts a fresh attempt'
                  : 'Re-establish the ROSBridge link now, without waiting for the next automatic retry'
              }
              className="flex items-center gap-1 rounded border border-signal-cyan/40 bg-signal-cyan/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-signal-cyan transition-colors hover:bg-signal-cyan/20"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              RECONNECT
            </button>
          )}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
