import { useCallback, useEffect, useMemo, useState } from 'react';
import amrSession from '../services/AmrSessionService.js';
import Dialog from './ui/Dialog.jsx';
import McapStorageService from '../services/McapStorageService.js';
import mcapRecordingService from '../services/McapRecordingService.js';
import cameraSnapshotService from '../services/CameraSnapshotService.js';
import useDataSourceSelection from '../hooks/useDataSourceSelection.js';
import useBackupSettings, { useSnapshotInterval } from '../hooks/useBackupSettings.js';
import { dataSourcesByCategory } from '../config/dataSources.js';
import useNow from '../hooks/useNow.js';
import { DEFAULT_CAMERA_TOPIC, getCameraStreamUrl } from '../config/endpoints.js';

const CAMERA_TOPIC = DEFAULT_CAMERA_TOPIC;
const CAMERA_STREAM = getCameraStreamUrl({ topic: CAMERA_TOPIC, quality: 75, framerate: 30 });

/** Stable short label for the current topic set, used in the .mcap filename. */
function topicSetLabel(sourceIds) {
  const sorted = [...sourceIds].sort().join('|');
  let hash = 0;
  for (let i = 0; i < sorted.length; i += 1) hash = (hash * 31 + sorted.charCodeAt(i)) | 0;
  return `rec-${(hash >>> 0).toString(16)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatElapsed(startedAt, now) {
  if (!startedAt) return '00:00:00';
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

async function listAllBackups(dirHandle) {
  if (!dirHandle) return [];
  const out = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory' && /^\d{4}-\d{2}-\d{2}T.*__/.test(entry.name)) {
      // eslint-disable-next-line no-await-in-loop
      const children = await listAllBackups(entry);
      out.push(...children.map((child) => ({ ...child, id: `${entry.name}/${child.id}`, name: `${entry.name}/${child.name}` })));
    }
    if (entry.kind === 'file' && entry.name.endsWith('.mcap')) {
      // eslint-disable-next-line no-await-in-loop -- small local folder listing, sequential is fine
      const file = await entry.getFile();
      out.push({ id: `mcap:${entry.name}`, name: entry.name, kind: 'mcap', size: file.size, mtime: file.lastModified, dir: dirHandle });
    }
  }
  try {
    const cameraDir = await dirHandle.getDirectoryHandle('camera');
    for await (const entry of cameraDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.jpg')) {
        // eslint-disable-next-line no-await-in-loop -- small local folder listing, sequential is fine
        const file = await entry.getFile();
        out.push({ id: `camera:${entry.name}`, name: entry.name, kind: 'camera', size: file.size, mtime: file.lastModified, dir: cameraDir });
      }
    }
  } catch {
    /* no camera/ subfolder yet — nothing captured there so far */
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function DisabledReason({ children }) {
  return <p className="mt-1 font-mono text-[9px] text-ink-low">{children}</p>;
}

export default function DataHandlingPage({ open, onClose }) {
  const isSupported = McapStorageService.isSupported;
  const now = useNow(1000);

  const [amrState, setAmrState] = useState(amrSession.getState());
  const [starting, setStarting] = useState(false);
  useEffect(() => amrSession.subscribe(setAmrState), []);

  const [folder, setFolder] = useState(null);
  const [folderError, setFolderError] = useState(null);
  const [backups, setBackups] = useState([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { enabled, enabledSources, toggle, selectAll, selectNone, applyRecommendedDefaults } = useDataSourceSelection();
  const { rotationIntervalMin, setRotationIntervalMin, retentionCount, setRetentionCount } = useBackupSettings();
  const { snapshotIntervalSec, setSnapshotIntervalSec } = useSnapshotInterval();

  const [recordingState, setRecordingState] = useState(mcapRecordingService.getState());
  const [cameraState, setCameraState] = useState(cameraSnapshotService.getState());
  const [thumbnail, setThumbnail] = useState(cameraSnapshotService.getState().lastCaptureUrl);

  useEffect(() => mcapRecordingService.onStatusChange(() => setRecordingState(mcapRecordingService.getState())), []);
  useEffect(() => cameraSnapshotService.onStatusChange(() => setCameraState(cameraSnapshotService.getState())), []);
  useEffect(() => cameraSnapshotService.onCapture((url) => setThumbnail(url)), []);
  useEffect(() => cameraSnapshotService.onError?.((err) => setFolderError(err.message)), []);
  useEffect(() => mcapRecordingService.onError?.((err) => setFolderError(err.message)), []);

  const topicSources = enabledSources.filter((s) => s.kind === 'topic');
  const cameraEnabled = enabled['camera-snapshots'];

  const refreshBackups = useCallback(async () => {
    if (!folder) {
      setBackups([]);
      return;
    }
    try { setBackups(await listAllBackups(folder)); }
    catch (err) { setFolderError(err.message); }
  }, [folder]);

  useEffect(() => {
    if (open) refreshBackups();
  }, [open, refreshBackups]);

  // Restore a previously-picked folder on open so the operator doesn't have
  // to re-pick every time the page is reopened.
  useEffect(() => {
    if (!open || !isSupported) return;
    McapStorageService.getSavedFolder().then((saved) => {
      if (saved) setFolder(saved);
    });
  }, [open, isSupported]);

  const sessionActive = starting || cameraState.status === 'capturing' || (recordingState.status !== 'idle' && recordingState.status !== 'stopped');

  async function handlePickFolder() {
    setFolderError(null);
    try {
      const handle = await McapStorageService.pickFolder();
      setFolder(handle);
      await amrSession.setRoot(handle);
    } catch (err) {
      if (err?.name !== 'AbortError') setFolderError('Could not open the folder picker.');
    }
  }

  async function handleStart() {
    if (!folder || (topicSources.length === 0 && !cameraEnabled)) return;
    setFolderError(null);

    setStarting(true);
    try {
      const granted = await McapStorageService.verifyPermission(folder);
      if (!granted) throw new Error('Write permission for the chosen folder was denied.');
      if (amrState.status === 'needs-permission') await amrSession.setRoot(folder);
      await amrSession.startCapture({
        recording: topicSources.length ? {
          sources: topicSources.map((s) => ({ id: s.id, messageType: s.messageType })),
          prefix: topicSetLabel(topicSources.map((s) => s.id)),
          rotationIntervalMin,
          retainCount: retentionCount,
        } : null,
        snapshots: cameraEnabled ? {
          streamUrl: CAMERA_STREAM,
          intervalSec: snapshotIntervalSec,
          retainCount: retentionCount,
        } : null,
      });
    } catch (err) { setFolderError(err.message); }
    finally { setStarting(false); }
  }

  async function handleStop() {
    try { await amrSession.stopCapture(); await refreshBackups(); }
    catch (err) { setFolderError(err.message); }
  }

  async function handleDelete(entry) {
    await entry.dir.removeEntry(entry.name);
    setDeleteConfirmId(null);
    refreshBackups();
  }

  const totals = useMemo(() => {
    const mcap = backups.filter((b) => b.kind === 'mcap');
    const camera = backups.filter((b) => b.kind === 'camera');
    const sum = (list) => list.reduce((n, b) => n + b.size, 0);
    return {
      mcapCount: mcap.length,
      mcapBytes: sum(mcap),
      cameraCount: camera.length,
      cameraBytes: sum(camera),
      totalBytes: sum(backups),
    };
  }, [backups]);

  const startDisabledReason = !folder
    ? 'Pick a folder first'
    : !['ready', 'needs-permission'].includes(amrState.status)
      ? 'Waiting for a confirmed server session and session folder'
      : topicSources.length === 0 && !cameraEnabled
      ? 'Select at least one data source'
      : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="DATA & BACKUPS"
      subtitle="Record ROS topics to .mcap and capture periodic camera snapshots, entirely in this browser"
    >
      {!isSupported ? (
        <div className="rounded-md border border-signal-amber/40 bg-signal-amber/10 p-4 font-mono text-[11px] text-signal-amber">
          This browser does not support the File System Access API (Chromium-only — Chrome or Edge). Data &amp;
          Backups is unavailable here; open the dashboard in a Chromium browser to use it.
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded border border-deck-line p-3 font-mono text-[11px] text-ink-mid" aria-live="polite">
            <p>AMR SESSION � {amrState.status.toUpperCase()}</p>
            <p>{amrState.folderName || 'Waiting for the robot to announce its power-on session'}</p>
            <p>{amrState.error || 'Recordings and camera images are saved only inside this session folder.'}</p>
            {amrState.status === 'needs-permission' && <p>Press Start Recording to grant folder access.</p>}
          </section>
          {/* Folder */}
          <section>
            <h3 className="mb-2 font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">FOLDER</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePickFolder}
                disabled={sessionActive}
                title={sessionActive ? 'Stop the current session before changing folders' : undefined}
                className="rounded bg-signal-cyan/15 px-3 py-1.5 font-display text-[11px] font-bold tracking-wider text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {folder ? 'CHANGE FOLDER' : 'PICK FOLDER'}
              </button>
              <span className="font-mono text-[11px] text-ink-mid">
                {folder ? folder.name : 'No folder selected'}
              </span>
            </div>
            {folderError && <DisabledReason>{folderError}</DisabledReason>}
          </section>

          {/* Data sources */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">DATA SOURCES</h3>
              <button
                type="button"
                onClick={applyRecommendedDefaults}
                className="font-mono text-[10px] text-ink-low transition-colors hover:text-signal-cyan"
              >
                USE RECOMMENDED DEFAULTS
              </button>
            </div>
            <div className="space-y-3">
              {dataSourcesByCategory().map((group) => (
                <div key={group.category}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-ink-low">
                      {group.category}
                    </span>
                    <span className="flex gap-2 font-mono text-[9px] text-ink-low">
                      <button type="button" onClick={() => selectAll(group.category)} className="hover:text-signal-cyan">
                        ALL
                      </button>
                      <button type="button" onClick={() => selectNone(group.category)} className="hover:text-signal-cyan">
                        NONE
                      </button>
                    </span>
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {group.sources.map((s) => (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-deck-800">
                          <input
                            type="checkbox"
                            checked={!!enabled[s.id]}
                            onChange={() => toggle(s.id)}
                            disabled={sessionActive}
                            className="accent-signal-cyan"
                          />
                          <span className="font-mono text-[10px] text-ink-mid">{s.label}</span>{' '}
                          {s.kind === 'topic' && <span className="font-mono text-[9px] text-ink-low">{s.id}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h3 className="mb-2 font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">SCHEDULE</h3>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] text-ink-low">ROTATION INTERVAL (MIN)</span>
                <input
                  type="number"
                  min={1}
                  value={rotationIntervalMin}
                  disabled={sessionActive}
                  onChange={(e) => setRotationIntervalMin(e.target.value)}
                  className="w-24 rounded border border-deck-line bg-deck-900 px-2 py-1 font-mono text-[11px] text-ink-high"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] text-ink-low">RETAIN (COUNT)</span>
                <input
                  type="number"
                  min={1}
                  value={retentionCount}
                  disabled={sessionActive}
                  onChange={(e) => setRetentionCount(e.target.value)}
                  className="w-24 rounded border border-deck-line bg-deck-900 px-2 py-1 font-mono text-[11px] text-ink-high"
                />
              </label>
              {cameraEnabled && (
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] text-ink-low">SNAPSHOT INTERVAL (SEC)</span>
                  <input
                    type="number"
                    min={1}
                    value={snapshotIntervalSec}
                    disabled={sessionActive}
                    onChange={(e) => setSnapshotIntervalSec(e.target.value)}
                    className="w-24 rounded border border-deck-line bg-deck-900 px-2 py-1 font-mono text-[11px] text-ink-high"
                  />
                </label>
              )}
            </div>
          </section>

          {/* Record control */}
          <section>
            <div className="flex items-center gap-3">
              <span
                title={startDisabledReason || undefined}
                className={startDisabledReason && !sessionActive ? 'cursor-not-allowed' : ''}
              >
                <button
                  type="button"
                  onClick={sessionActive ? handleStop : handleStart}
                  disabled={starting || (!sessionActive && !!startDisabledReason)}
                  className={`rounded px-4 py-2 font-display text-xs font-bold tracking-[0.1em] ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    sessionActive
                      ? 'bg-signal-red/20 text-signal-red ring-signal-red/50 hover:bg-signal-red/30'
                      : 'bg-signal-green/15 text-signal-green ring-signal-green/40 hover:bg-signal-green/25'
                  }`}
                >
                  {sessionActive ? 'STOP' : 'START RECORDING'}
                </button>
              </span>
              <span className="font-mono text-[11px] text-ink-mid">
                {recordingState.status === 'idle' || recordingState.status === 'stopped'
                  ? cameraState.status === 'capturing'
                    ? 'CAPTURING CAMERA SNAPSHOTS ONLY'
                    : 'IDLE'
                  : recordingState.status === 'paused'
                    ? `PAUSED — LINK DOWN · ${formatElapsed(recordingState.startedAt, now)}`
                    : recordingState.status === 'rotating'
                      ? `ROTATING · ${formatElapsed(recordingState.startedAt, now)}`
                      : `RECORDING ${formatElapsed(recordingState.startedAt, now)}`}
              </span>
            </div>
            {startDisabledReason && !sessionActive && <DisabledReason>{startDisabledReason}</DisabledReason>}
          </section>

          {/* Camera snapshot / live preview status */}
          {cameraEnabled && cameraState.status === 'unavailable' && (
            <div className="rounded-md border border-signal-amber/40 bg-signal-amber/10 p-3 font-mono text-[11px] text-signal-amber" role="alert">
              Camera server does not allow snapshot capture yet — see docs/server-side-requests.md. Display-only
              viewing elsewhere in the dashboard is unaffected.
            </div>
          )}

          {/* Live stream preview thumbnail when recording is active or snapshots are enabled */}
          {(sessionActive || cameraEnabled) && (
            <section className="rounded border border-deck-line bg-deck-900/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">
                  {thumbnail ? 'LATEST SNAPSHOT & LIVE FEED' : 'LIVE CAMERA TELEMETRY FEED'}
                </h3>
                <span className="font-mono text-[9px] text-signal-green">
                  ● {CAMERA_TOPIC}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {thumbnail && (
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-ink-low">SAVED SNAPSHOT</span>
                    <img src={thumbnail} alt="Most recent camera snapshot" className="h-28 w-auto rounded border border-deck-line object-cover" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] text-ink-low">LIVE STREAM (LOGITECH C270)</span>
                  <img
                    src={CAMERA_STREAM}
                    alt="Live Logitech C270 stream preview"
                    className="h-28 w-auto rounded border border-deck-line bg-deck-950 object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Backups */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-signal-cyan">
                BACKUPS
                <span className="ml-2 font-mono text-[9px] font-normal text-ink-low">
                  {totals.mcapCount} .mcap ({formatBytes(totals.mcapBytes)}) · {totals.cameraCount} images (
                  {formatBytes(totals.cameraBytes)}) · {formatBytes(totals.totalBytes)} total
                </span>
              </h3>
              <button type="button" onClick={refreshBackups} className="font-mono text-[10px] text-ink-low hover:text-signal-cyan">
                REFRESH
              </button>
            </div>
            {backups.length === 0 ? (
              <p className="font-mono text-[10px] text-ink-low">
                {folder ? 'No backups in this folder yet.' : 'Pick a folder to see existing backups.'}
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-auto">
                {backups.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded border border-deck-line bg-deck-900/40 px-2 py-1"
                  >
                    <span className="flex items-center gap-2 font-mono text-[10px] text-ink-mid">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          b.kind === 'mcap' ? 'bg-signal-violet/15 text-signal-violet' : 'bg-signal-cyan/15 text-signal-cyan'
                        }`}
                      >
                        {b.kind === 'mcap' ? 'MCAP' : 'IMG'}
                      </span>
                      {b.name}
                      <span className="text-ink-low">
                        {formatBytes(b.size)} · {new Date(b.mtime).toLocaleString()}
                      </span>
                    </span>
                    {deleteConfirmId === b.id ? (
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(b)}
                          className="font-mono text-[10px] font-bold text-signal-red hover:opacity-80"
                        >
                          DELETE
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="font-mono text-[10px] text-ink-low hover:text-ink-high"
                        >
                          KEEP
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(b.id)}
                        className="shrink-0 font-mono text-[10px] text-ink-low transition-colors hover:text-signal-red"
                      >
                        DELETE
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
