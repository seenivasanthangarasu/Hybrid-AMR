import { useCallback, useEffect, useState } from 'react';
import mapStorage from '../../services/MapStorageService.js';
import Dialog from '../ui/Dialog.jsx';

export default function IndoorMapPicker({
  open,
  onClose,
  onSelectMap,
  onGoToMapping,
  selectedMapId = null,
}) {
  const [state, setState] = useState({
    status: 'loading', // 'loading' | 'needs-folder' | 'needs-permission' | 'unsupported' | 'empty' | 'ready' | 'error'
    maps: [],
    error: null,
  });

  const loadMaps = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await mapStorage.listMaps();
      setState({
        status: res.status,
        maps: res.maps || [],
        error: res.error || null,
      });
    } catch (err) {
      setState({
        status: 'error',
        maps: [],
        error: err.message,
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadMaps();
    }
  }, [open, loadMaps]);

  async function handlePickFolder() {
    try {
      await mapStorage.pickRootFolder();
      await loadMaps();
    } catch (err) {
      if (err.name !== 'AbortError') {
        setState((s) => ({ ...s, error: err.message }));
      }
    }
  }

  async function handleGrantPermission() {
    try {
      const root = await mapStorage.getRootFolder();
      if (root) {
        await mapStorage.checkPermission(root, 'read', true);
        await loadMaps();
      }
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="INDOOR MAP LIBRARY">
      <div className="flex flex-col gap-4 text-ink-high">
        {state.error && <p role="alert" className="text-signal-amber text-sm">{state.error}</p>}
        {(state.status === 'error' || state.status === 'corrupt') && <div className="text-ink-mid text-sm"><p>{state.status === 'corrupt' ? 'Map files are incomplete or corrupt. Restore them or generate a new map.' : 'Cannot read the map library. Check the folder and permissions.'}</p><button onClick={loadMaps} className="min-h-11 text-signal-cyan">Retry scan</button></div>}
        {state.status === 'loading' && (
          <div className="flex items-center justify-center p-8 font-mono text-sm text-ink-mid">
            <span className="inline-block h-3 w-3 animate-pulse-slow rounded-full bg-signal-cyan mr-2" />
            Loading saved maps...
          </div>
        )}

        {state.status === 'unsupported' && (
          <div className="rounded border border-signal-amber/40 bg-signal-amber/10 p-4">
            <h3 className="font-mono text-sm font-bold text-signal-amber">STORAGE API UNSUPPORTED</h3>
            <p className="mt-1 font-mono text-xs text-ink-mid">
              Your browser does not support the File System Access API required for persistent map storage.
              Please use Chromium-based browser (Chrome, Edge) to access the map library.
            </p>
          </div>
        )}

        {state.status === 'needs-folder' && (
          <div className="rounded border border-deck-line bg-deck-900/60 p-4 text-center">
            <h3 className="font-mono text-sm font-bold text-ink-high">SELECT STORAGE FOLDER</h3>
            <p className="mt-1 font-mono text-xs text-ink-mid">
              No storage folder is selected. Choose a folder on your computer where AMR telemetry and maps are saved.
            </p>
            <button
              type="button"
              onClick={handlePickFolder}
              className="mt-3 rounded border border-signal-cyan/50 bg-signal-cyan/15 px-3 py-1.5 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/25"
            >
              CHOOSE FOLDER
            </button>
          </div>
        )}

        {state.status === 'needs-permission' && (
          <div className="rounded border border-signal-amber/40 bg-signal-amber/10 p-4 text-center">
            <h3 className="font-mono text-sm font-bold text-signal-amber">PERMISSION REQUIRED</h3>
            <p className="mt-1 font-mono text-xs text-ink-mid">
              Browser permission is needed to read saved maps from your chosen storage directory.
            </p>
            <button
              type="button"
              onClick={handleGrantPermission}
              className="mt-3 rounded border border-signal-amber/50 bg-signal-amber/20 px-3 py-1.5 font-mono text-xs font-bold text-signal-amber hover:bg-signal-amber/30"
            >
              GRANT PERMISSION
            </button>
          </div>
        )}

        {state.status === 'empty' && (
          <div className="rounded border border-deck-line bg-deck-900/40 p-6 text-center">
            <div className="mb-2 font-mono text-sm font-bold text-ink-mid">NO INDOOR MAPS FOUND</div>
            <p className="font-mono text-xs text-ink-low max-w-sm mx-auto">
              Indoor Navigation requires an indoor map. Generate a map by scanning your environment in Mapping Mode.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              {onGoToMapping && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onGoToMapping();
                  }}
                  className="rounded border border-signal-cyan/50 bg-signal-cyan/20 px-4 py-2 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/30"
                >
                  CREATE MAP IN MAPPING MODE →
                </button>
              )}
              <button
                type="button"
                onClick={loadMaps}
                className="rounded border border-deck-line bg-deck-800 px-3 py-2 font-mono text-xs text-ink-mid hover:text-ink-high"
              >
                REFRESH
              </button>
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-ink-mid">
                {state.maps.length} {state.maps.length === 1 ? 'map' : 'maps'} available
              </span>
              <button
                type="button"
                onClick={loadMaps}
                className="font-mono text-[11px] text-signal-cyan hover:underline"
              >
                Refresh library
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
              {state.maps.map((map) => {
                const isSelected = selectedMapId === map.map_id;
                const widthM = (map.grid.width * map.grid.resolution).toFixed(1);
                const heightM = (map.grid.height * map.grid.resolution).toFixed(1);
                const dateStr = new Date(map.created_at).toLocaleString();

                return (
                  <div
                    key={`${map.map_id}-rev${map.revision}`}
                    className={`flex items-center justify-between rounded border p-3 transition-colors ${
                      isSelected
                        ? 'border-signal-cyan/60 bg-signal-cyan/10'
                        : 'border-deck-line bg-deck-900/60 hover:border-deck-line/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink-high truncate">
                          {map.name}
                        </span>
                        <span className="rounded bg-deck-800 border border-deck-line px-1.5 py-0.2 font-mono text-[9px] text-ink-low">
                          rev {map.revision}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-low">
                        <span>{widthM}m × {heightM}m</span>
                        <span>Res: {map.grid.resolution}m</span>
                        <span>{dateStr}</span>
                        {map.source?.robot_id && <span>Robot: {map.source.robot_id}</span>}
                      </div>
                    </div>

                    <div className="ml-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectMap?.(map);
                          onClose?.();
                        }}
                        className={`rounded px-3 py-1.5 font-mono text-xs font-bold tracking-wider transition-colors ${
                          isSelected
                            ? 'border border-signal-cyan/60 bg-signal-cyan/20 text-signal-cyan'
                            : 'border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan hover:bg-signal-cyan/25'
                        }`}
                      >
                        {isSelected ? 'SELECTED' : 'SELECT MAP'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
