import { useState } from 'react';
import RobotCommandService, { CommandError } from '../services/RobotCommandService.js';
import CommandFeedback from './CommandFeedback.jsx';
import PanelHeader from './ui/PanelHeader.jsx';
import ErrorDialog from './ErrorDialog.jsx';
import { ERRORS } from '../errors/catalog.js';

const ESTOP_CONFIRM_MS = 3000;
const DISABLED_REASON = 'Disconnected — commands unavailable';

const ACTIONS = [
  {
    key: 'start',
    label: 'START',
    cls: 'bg-signal-green/15 text-signal-green ring-signal-green/40 hover:bg-signal-green/25',
  },
  {
    key: 'pause',
    label: 'PAUSE',
    cls: 'bg-signal-amber/15 text-signal-amber ring-signal-amber/40 hover:bg-signal-amber/25',
  },
  {
    key: 'resume',
    label: 'RESUME',
    cls: 'bg-signal-cyan/15 text-signal-cyan ring-signal-cyan/40 hover:bg-signal-cyan/25',
  },
  {
    key: 'stop',
    label: 'STOP',
    cls: 'bg-signal-red/15 text-signal-red ring-signal-red/40 hover:bg-signal-red/25',
  },
  {
    key: 'returnHome',
    label: 'RETURN HOME',
    cls: 'bg-signal-violet/15 text-signal-violet ring-signal-violet/40 hover:bg-signal-violet/25',
  },
];

function errorDetail(err) {
  if (err instanceof CommandError) {
    return err.code === 'DISCONNECTED' ? 'disconnected' : 'publish failed';
  }
  return 'unexpected error';
}

// A command that did NOT reach the robot is the one thing the operator must not
// miss — the inline feedback line is easy to overlook mid-incident, so a failure
// is also raised as a dialog naming the cause and the fallback (physical e-stop).
function errorEntry(err) {
  if (err instanceof CommandError && err.code === 'DISCONNECTED') return ERRORS.COMMAND_DISCONNECTED;
  return ERRORS.COMMAND_PUBLISH_FAILED;
}

export default function ControlPanel({ connectionStatus }) {
  const [status, setStatus] = useState(null);
  const [confirmEstop, setConfirmEstop] = useState(false);
  const [fault, setFault] = useState(null); // { error, context }
  const disabled = connectionStatus !== 'connected';

  function dispatch(key, label) {
    setStatus({ state: 'SENDING', label, at: new Date() });
    try {
      const result = RobotCommandService[key]?.();
      setStatus({ state: result?.state ?? 'SENT_UNCONFIRMED', label, at: new Date() });
    } catch (err) {
      setStatus({ state: 'FAILED', label, at: new Date(), detail: errorDetail(err) });
      setFault({ error: errorEntry(err), context: label });
    }
  }

  function handleEstop() {
    if (!confirmEstop) {
      setConfirmEstop(true);
      setTimeout(() => setConfirmEstop(false), ESTOP_CONFIRM_MS);
      return;
    }
    setConfirmEstop(false);
    dispatch('emergencyStop', 'EMERGENCY STOP');
  }

  return (
    <div className="panel h-full overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader title="CONTROL PANEL" />
      {disabled && (
        <p
          id="control-disabled-reason"
          className="mb-2 font-mono text-[10px] text-signal-red"
          role="status"
          aria-live="polite"
        >
          {DISABLED_REASON.toUpperCase()}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          // Wrapper carries the reason tooltip: a disabled <button> won't show
          // its own title on hover, so pointer-events-none lets the hover fall
          // through to this span, and aria-describedby names the reason for
          // assistive tech (spec REQ-19).
          <span
            key={a.key}
            title={disabled ? DISABLED_REASON : undefined}
            className={`block ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <button
              disabled={disabled}
              aria-disabled={disabled}
              aria-describedby={disabled ? 'control-disabled-reason' : undefined}
              title={disabled ? undefined : a.label}
              onClick={() => dispatch(a.key, a.label)}
              className={`w-full rounded py-2 font-display text-xs font-bold tracking-[0.08em] ring-1 transition-colors disabled:opacity-40 ${
                disabled ? 'pointer-events-none' : ''
              } ${a.cls}`}
            >
              {a.label}
            </button>
          </span>
        ))}
        <div className="col-span-2">
          <span
            title={disabled ? DISABLED_REASON : undefined}
            className={`block ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <button
              disabled={disabled}
              aria-disabled={disabled}
              aria-describedby={disabled ? 'control-disabled-reason' : undefined}
              title={disabled ? undefined : 'Two-click confirm — arms, then triggers emergency stop'}
              onClick={handleEstop}
              aria-live="assertive"
              className={`w-full rounded py-2.5 font-display text-xs font-bold tracking-[0.1em] ring-1 transition-colors disabled:opacity-40 ${
                disabled ? 'pointer-events-none' : ''
              } ${
                confirmEstop
                  ? 'animate-pulse-slow bg-signal-red text-deck-950 ring-signal-red'
                  : 'bg-signal-red/20 text-signal-red ring-signal-red/50 hover:bg-signal-red/30'
              }`}
            >
              {confirmEstop ? 'CONFIRM EMERGENCY STOP' : 'EMERGENCY STOP'}
            </button>
          </span>
          {/* Visible confirm-window countdown so the operator sees how long
              they have to confirm (spec REQ-17). key= restarts the animation
              each time the window (re)opens. */}
          {confirmEstop && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-signal-red/20" aria-hidden="true">
              <div
                key={status?.at?.getTime() ?? confirmEstop}
                className="h-full w-full origin-left rounded bg-signal-red animate-estop-countdown"
              />
            </div>
          )}
        </div>
      </div>
      <CommandFeedback status={status} />

      <ErrorDialog
        error={fault?.error}
        open={!!fault}
        onClose={() => setFault(null)}
        context={fault?.context}
      />
    </div>
  );
}
