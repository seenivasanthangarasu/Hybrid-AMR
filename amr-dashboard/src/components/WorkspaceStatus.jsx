import { useState, useSyncExternalStore } from 'react';
import bridge from '../services/WorkspaceBridge.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

export default function WorkspaceStatus() {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getState);
  const workspace = useWorkspace();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  async function request(op) {
    setPending(true); setError(null);
    try {
      if (op === 'workspace.configure') {
        bridge.assertIdle();
        await bridge.request(op, { environment: workspace.effectiveEnvironment, operating_mode: workspace.operatingMode });
      } else await bridge.reconcile();
    } catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <div className="flex flex-wrap items-center gap-3 border-b border-deck-line bg-deck-900 px-4 py-2 font-mono text-xs text-ink-mid">
    <span role="status">{state ? `ROBOT WORKSPACE: ${state.environment} · ${state.operation.state}` : 'WORKSPACE SERVER UNAVAILABLE — waiting for capability heartbeat'}</span>
    {state && <><button disabled={pending} className="min-h-11 text-signal-cyan disabled:opacity-50" onClick={() => request('workspace.configure')}>Apply selected workspace to robot</button><button disabled={pending} className="min-h-11 text-signal-cyan disabled:opacity-50" onClick={() => request('operation.reconcile')}>Reconcile operation status</button></>}
    {(error || workspace.transitionError) && <p role="alert" className="w-full text-signal-amber">{error || workspace.transitionError}</p>}
  </div>;
}
