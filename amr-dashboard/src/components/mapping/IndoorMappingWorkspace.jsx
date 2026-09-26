import { useEffect, useState } from 'react';
import mappingService from '../../services/MappingService.js';
import useOccupancyGrid from '../../hooks/useOccupancyGrid.js';
import SlamView from '../SlamView.jsx';
import PanelHeader from '../ui/PanelHeader.jsx';

export default function IndoorMappingWorkspace({ onProceedToNavigation }) {
  const [mappingState, setMappingState] = useState(mappingService.getState);
  const [mapNameInput, setMapNameInput] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const liveGrid = useOccupancyGrid();

  useEffect(() => {
    return mappingService.subscribe(setMappingState);
  }, []);

  // Track elapsed time while running
  useEffect(() => {
    if (mappingState.status !== 'running' || !mappingState.startTime) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - mappingState.startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [mappingState.status, mappingState.startTime]);

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  async function handleStart() {
    try {
      await mappingService.startMapping();
    } catch {
      /* error is surfaced in mappingState.error */
    }
  }

  async function handleSaveConfirm() {
    const finalName = mapNameInput.trim() || `Indoor Map ${new Date().toLocaleTimeString([], { hour12: false })}`;
    setShowSaveDialog(false);
    try {
      await mappingService.finishAndSave({ mapName: finalName });
    } catch {
      /* error is surfaced in mappingState.error */
    }
  }

  function handleCancel() {
    if (window.confirm('Cancel current mapping run? Any unsaved map data will be discarded.')) {
      mappingService.cancel();
    }
  }

  const isRunning = mappingState.status === 'running';
  const isPending = mappingState.status === 'start_pending';
  const isSaving =
    mappingState.status === 'finalizing' ||
    mappingState.status === 'transferring' ||
    mappingState.status === 'verifying' ||
    mappingState.status === 'saving';
  const isSaved = mappingState.status === 'saved';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-deck-line bg-deck-950">
      {/* Top mapping control toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-deck-line bg-deck-900/90 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <PanelHeader title="INDOOR MAPPING WORKSPACE" />
          <span
            className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider ${
              isRunning
                ? 'bg-signal-green/20 text-signal-green border border-signal-green/40'
                : isPending
                  ? 'bg-signal-amber/20 text-signal-amber border border-signal-amber/40 animate-pulse'
                  : isSaving
                    ? 'bg-signal-cyan/20 text-signal-cyan border border-signal-cyan/40 animate-pulse'
                    : isSaved
                      ? 'bg-signal-green/20 text-signal-green border border-signal-green/40'
                      : 'bg-deck-800 text-ink-mid border border-deck-line'
            }`}
          >
            {mappingState.status.toUpperCase()}
          </span>

          {isRunning && (
            <span className="font-mono text-xs font-semibold text-ink-mid">
              DURATION: <span className="text-signal-cyan">{formatElapsed(elapsedSeconds)}</span>
            </span>
          )}

          {mappingState.runId && (
            <span className="font-mono text-[10px] text-ink-low">RUN: {mappingState.runId}</span>
          )}
        </div>

        {/* Toolbar actions */}
        {['interrupted', 'failed'].includes(mappingState.status) && mappingState.runId && <button className="min-h-11 text-signal-cyan" onClick={() => mappingService.recover().catch(() => {})}>RECOVER RUN / RETRY TRANSFER</button>}
        {['interrupted', 'failed', 'start_pending'].includes(mappingState.status) && mappingState.runId && <button className="min-h-11 text-signal-amber" onClick={() => mappingService.cancel()}>REQUEST CANCELLATION</button>}

        {['interrupted', 'failed'].includes(mappingState.status) && mappingState.runId && <button className="min-h-11 text-signal-cyan" onClick={() => mappingService.recover().catch(() => {})}>RECOVER RUN / RETRY TRANSFER</button>}
        {['interrupted', 'failed', 'start_pending'].includes(mappingState.status) && mappingState.runId && <button className="min-h-11 text-signal-amber" onClick={() => mappingService.cancel()}>REQUEST CANCELLATION</button>}

        <div className="flex items-center gap-2">
          {(mappingState.status === 'idle' || (mappingState.status === 'failed' && !mappingState.runId)) && (
            <button
              type="button"
              onClick={handleStart}
              className="rounded border border-signal-green/50 bg-signal-green/20 px-3 py-1 font-mono text-xs font-bold text-signal-green hover:bg-signal-green/30"
            >
              START MAPPING
            </button>
          )}

          {isRunning && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMapNameInput(`Map ${new Date().toLocaleTimeString([], { hour12: false })}`);
                  setShowSaveDialog(true);
                }}
                disabled={!liveGrid.hasData}
                title={!liveGrid.hasData ? 'Waiting for map data from SLAM topic...' : 'Finish and save map'}
                className="rounded border border-signal-cyan/50 bg-signal-cyan/20 px-3 py-1 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/30 disabled:opacity-40"
              >
                FINISH &amp; SAVE MAP
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded border border-signal-red/40 bg-signal-red/10 px-3 py-1 font-mono text-xs text-signal-red hover:bg-signal-red/20"
              >
                CANCEL
              </button>
            </>
          )}

          {isSaved && (
            <>
              <button
                type="button"
                onClick={() => onProceedToNavigation?.(mappingState.savedMap)}
                className="rounded border border-signal-cyan/60 bg-signal-cyan/25 px-3 py-1 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/35"
              >
                PROCEED TO INDOOR NAVIGATION →
              </button>
              <button
                type="button"
                onClick={() => mappingService.cancel()}
                className="rounded border border-deck-line bg-deck-800 px-3 py-1 font-mono text-xs text-ink-mid hover:text-ink-high"
              >
                NEW MAP
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {mappingState.error && (
        <div className="flex items-center justify-between border-b border-signal-red/40 bg-signal-red/15 px-4 py-2 font-mono text-xs text-signal-red">
          <span>{mappingState.error}</span>
          <button
            type="button"
            onClick={() => mappingService.emit({ error: null })}
            className="text-[10px] text-signal-red hover:underline"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Saving progress banner */}
      {isSaving && (
        <div className="flex items-center gap-3 border-b border-signal-cyan/30 bg-signal-cyan/10 px-4 py-2 font-mono text-xs text-signal-cyan">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal-cyan" />
          <span>Finalizing and transferring map artifact ({mappingState.status})...</span>
        </div>
      )}

      {/* Main SLAM Live Visualizer */}
      <div className="relative min-h-0 flex-1">
        <SlamView />

        {(mappingState.status === 'idle' || (mappingState.status === 'failed' && !mappingState.runId)) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-deck-950/60 p-6 text-center">
            <div className="max-w-md rounded-md border border-deck-line bg-deck-900/90 p-5 shadow-panel">
              <h3 className="font-mono text-sm font-bold text-ink-high">INDOOR MAPPING READY</h3>
              <p className="mt-2 font-mono text-xs text-ink-mid">
                Press <b>START MAPPING</b> to begin SLAM exploration. Drive the robot through the space to construct the occupancy grid, then press <b>FINISH &amp; SAVE</b> to save the map artifact to client storage.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save Name Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-deck-950/80 p-4">
          <div className="w-full max-w-sm rounded border border-deck-line bg-deck-900 p-4 shadow-panel">
            <h3 className="font-mono text-sm font-bold text-ink-high">NAME YOUR MAP</h3>
            <p className="mt-1 font-mono text-xs text-ink-mid">
              Enter a name for this map before saving to client storage:
            </p>
            <input
              type="text"
              value={mapNameInput}
              onChange={(e) => setMapNameInput(e.target.value)}
              placeholder="e.g. Office 2nd Floor"
              className="mt-3 w-full rounded border border-deck-line bg-deck-950 px-3 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="rounded border border-deck-line bg-deck-800 px-3 py-1.5 font-mono text-xs text-ink-mid hover:text-ink-high"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSaveConfirm}
                className="rounded border border-signal-cyan/50 bg-signal-cyan/20 px-3 py-1.5 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/30"
              >
                SAVE ARTIFACT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
