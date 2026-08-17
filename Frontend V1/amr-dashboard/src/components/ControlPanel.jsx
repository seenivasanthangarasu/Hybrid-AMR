import { useState } from 'react';
import RobotCommandService from '../services/RobotCommandService.js';

const ACTIONS = [
  { key: 'start', label: 'START', cls: 'bg-signal-green/15 text-signal-green ring-signal-green/40 hover:bg-signal-green/25' },
  { key: 'pause', label: 'PAUSE', cls: 'bg-signal-amber/15 text-signal-amber ring-signal-amber/40 hover:bg-signal-amber/25' },
  { key: 'resume', label: 'RESUME', cls: 'bg-signal-cyan/15 text-signal-cyan ring-signal-cyan/40 hover:bg-signal-cyan/25' },
  { key: 'stop', label: 'STOP', cls: 'bg-signal-red/15 text-signal-red ring-signal-red/40 hover:bg-signal-red/25' },
  { key: 'returnHome', label: 'RETURN HOME', cls: 'bg-signal-violet/15 text-signal-violet ring-signal-violet/40 hover:bg-signal-violet/25' },
];

export default function ControlPanel() {
  const [lastAction, setLastAction] = useState(null);
  const [confirmEstop, setConfirmEstop] = useState(false);

  function dispatch(key) {
    RobotCommandService[key]?.();
    setLastAction({ key, at: new Date() });
  }

  function handleEstop() {
    if (!confirmEstop) {
      setConfirmEstop(true);
      setTimeout(() => setConfirmEstop(false), 3000);
      return;
    }
    RobotCommandService.emergencyStop();
    setLastAction({ key: 'emergencyStop', at: new Date() });
    setConfirmEstop(false);
  }

  return (
    <div className="panel rounded-md p-3 shadow-panel">
      <h3 className="mb-2 font-display text-[11px] font-bold tracking-[0.14em] text-ink-mid">CONTROL PANEL</h3>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => dispatch(a.key)}
            className={`rounded py-2 font-display text-xs font-bold tracking-[0.08em] ring-1 transition-colors ${a.cls}`}
          >
            {a.label}
          </button>
        ))}
        <button
          onClick={handleEstop}
          className={`col-span-2 rounded py-2.5 font-display text-xs font-bold tracking-[0.1em] ring-1 transition-colors ${
            confirmEstop
              ? 'animate-pulse-slow bg-signal-red text-deck-950 ring-signal-red'
              : 'bg-signal-red/20 text-signal-red ring-signal-red/50 hover:bg-signal-red/30'
          }`}
        >
          {confirmEstop ? 'CONFIRM EMERGENCY STOP' : 'EMERGENCY STOP'}
        </button>
      </div>
      {lastAction && (
        <p className="mt-2 font-mono text-[10px] text-ink-low">
          Last: {lastAction.key.toUpperCase()} — {lastAction.at.toLocaleTimeString([], { hour12: false })}
        </p>
      )}
    </div>
  );
}