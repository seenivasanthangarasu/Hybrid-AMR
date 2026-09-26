import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext.jsx';
import SavedMapPreview from '../maps/SavedMapPreview.jsx';
import IndoorMapPicker from '../maps/IndoorMapPicker.jsx';
import MapActivationService from '../../services/MapActivationService.js';
import RobotCommandService from '../../services/RobotCommandService.js';

export default function IndoorNavGate({ children }) {
  const {
    selectedMap,
    setSelectedMap,
    mapActivation,
    updateMapActivation,
    setOperatingMode,
  } = useWorkspace();

  const [initialPoseX, setInitialPoseX] = useState('');
  const [initialPoseY, setInitialPoseY] = useState('');
  const [initialPoseYaw, setInitialPoseYaw] = useState('0');
  const [initialPoseFeedback, setInitialPoseFeedback] = useState(null);

  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), [mapActivation.operationId, selectedMap]);

  // If no map is selected yet, render map selection picker
  if (!selectedMap) {
    return (
      <div className="h-full flex flex-col p-4 overflow-y-auto">
        <IndoorMapPicker
          open={true}
          onSelectMap={(map) => setSelectedMap(map)}
          onGoToMapping={() => setOperatingMode('mapping')}
          onClose={() => setOperatingMode('manual')}
        />
      </div>
    );
  }

  // Handle map activation trigger
  const handleActivate = async () => {
    pending.current?.abort();
    pending.current = new AbortController();
    await MapActivationService.activateMap({
      map: selectedMap,
      operationId: mapActivation.operationId || `act-${Date.now()}`,
      onStatus: updateMapActivation,
      signal: pending.current.signal,
    });
  };

  const handleSetInitialPose = async () => {
    try {
      await RobotCommandService.setInitialPose({
        x: initialPoseX,
        y: initialPoseY,
        yaw: initialPoseYaw,
      });
      setInitialPoseFeedback({ type: 'success', message: 'Initial pose dispatched to /initialpose' });
    } catch (err) {
      setInitialPoseFeedback({ type: 'error', message: err.message });
    }
  };

  // If map is active and ready, render children with top map identity banner
  if (mapActivation.status === 'ready') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-1.5 bg-deck-800 border-b border-deck-line shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[11px] text-ink-mid uppercase tracking-wider font-semibold">Active Map:</span>
            <span className="text-xs font-mono text-ink-high font-medium">{selectedMap.name || selectedMap.map_id}</span>
            <span className="text-[10px] text-ink-mid font-mono">(rev {selectedMap.revision})</span>
          </div>
          <button
            onClick={() => setSelectedMap(null)}
            className="text-xs text-ink-mid hover:text-ink-high px-2 py-0.5 rounded border border-deck-line hover:border-signal-cyan transition-colors"
          >
            Change Map
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          {children}
        </div>
      </div>
    );
  }

  // Render Activation Gate state card
  return (
    <div className="h-full flex items-center justify-center p-6 bg-deck-950/95">
      <div className="max-w-md w-full bg-deck-800 border border-deck-line rounded-lg p-5 shadow-xl flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-high uppercase tracking-wide">
              Indoor Map Activation Gate
            </h3>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-medium ${
                mapActivation.status === 'failed' || mapActivation.status === 'unavailable'
                  ? 'bg-rose-950/70 border border-rose-800 text-rose-300'
                  : 'bg-amber-950/70 border border-amber-800 text-amber-300'
              }`}
            >
              {mapActivation.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-ink-mid mt-1">
            Nav2 and localization must confirm the selected map artifact before navigation goals can be dispatched.
          </p>
        </div>

        {/* Selected map metadata */}
        <div className="bg-deck-950 border border-deck-line/60 rounded p-3 text-xs space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-ink-mid">Map:</span>
            <span className="text-ink-high font-medium">{selectedMap.name || selectedMap.map_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-mid">Revision:</span>
            <span className="text-ink-high">{selectedMap.revision}</span>
          </div>
          {selectedMap.grid?.resolution && (
            <div className="flex justify-between">
              <span className="text-ink-mid">Resolution:</span>
              <span className="text-ink-high">{selectedMap.grid?.resolution} m/cell</span>
            </div>
          )}
          {selectedMap.width && selectedMap.height && (
            <div className="flex justify-between">
              <span className="text-ink-mid">Dimensions:</span>
              <span className="text-ink-high">{selectedMap.width} x {selectedMap.height}</span>
            </div>
          )}
        </div>

        <SavedMapPreview map={selectedMap} />
        {/* Error / unavailable warning */}
        {mapActivation.error && (
          <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/80 text-rose-200 text-xs">
            <span className="font-semibold block mb-0.5">Activation Error:</span>
            {mapActivation.error}
          </div>
        )}

        {/* Awaiting localization initial pose inputs */}
        {mapActivation.status === 'awaiting_localization' && (
          <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded flex flex-col gap-2">
            <div className="text-xs text-amber-300 font-medium">Initial Pose Estimate (AMCL)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-ink-mid block">X (m)</label>
                <input
                  type="number"
                  step="0.1"
                  aria-label="Initial pose X (m)" value={initialPoseX}
                  onChange={(e) => setInitialPoseX(e.target.value)}
                  className="w-full bg-deck-950 border border-deck-line rounded px-2 py-1 text-xs text-ink-high font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-ink-mid block">Y (m)</label>
                <input
                  type="number"
                  step="0.1"
                  aria-label="Initial pose Y (m)" value={initialPoseY}
                  onChange={(e) => setInitialPoseY(e.target.value)}
                  className="w-full bg-deck-950 border border-deck-line rounded px-2 py-1 text-xs text-ink-high font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-ink-mid block">Yaw (rad)</label>
                <input
                  type="number"
                  step="0.05"
                  aria-label="Initial pose yaw (rad)" value={initialPoseYaw}
                  onChange={(e) => setInitialPoseYaw(e.target.value)}
                  className="w-full bg-deck-950 border border-deck-line rounded px-2 py-1 text-xs text-ink-high font-mono"
                />
              </div>
            </div>
            {initialPoseFeedback && (
              <div
                className={`text-[11px] ${
                  initialPoseFeedback.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {initialPoseFeedback.message}
              </div>
            )}
            <button
              onClick={handleSetInitialPose}
              className="mt-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-600/50 rounded text-xs font-medium transition-colors"
            >
              Set Initial Pose & Confirm
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-deck-line/60">
          <button
            onClick={() => setSelectedMap(null)}
            className="text-xs text-ink-mid hover:text-ink-high px-3 py-1.5 rounded border border-deck-line hover:border-signal-cyan transition-colors"
          >
            Choose Different Map
          </button>

          {mapActivation.status !== 'awaiting_localization' && (
            <button
              onClick={handleActivate}
              disabled={mapActivation.status === 'uploading' || mapActivation.status === 'loading'}
              className="px-4 py-1.5 bg-signal-cyan text-deck-950 font-semibold rounded text-xs hover:bg-signal-cyan/90 disabled:opacity-50 transition-colors"
            >
              {mapActivation.status === 'uploading' || mapActivation.status === 'loading'
                ? 'Activating...'
                : mapActivation.status === 'failed' || mapActivation.status === 'unavailable'
                  ? 'Retry Activation'
                  : 'Activate Map on Robot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
