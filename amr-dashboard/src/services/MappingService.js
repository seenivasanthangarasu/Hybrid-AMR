import bridge from './WorkspaceBridge.js';
import amrSession, { sessionFolderName, parseSession } from './AmrSessionService.js';
import mapStorage from './MapStorageService.js';
import transfer from './MapTransferService.js';
import { validateManifest } from '../utils/mapManifest.js';

export class MappingService {
  constructor(deps = {}) {
    this.bridge = deps.bridge || bridge;
    this.session = deps.session || amrSession;
    this.storage = deps.storage || mapStorage;
    this.transfer = deps.transfer || transfer;
    this.listeners = new Set();
    let recovery;
    try { recovery = JSON.parse(localStorage.getItem('xtrmbly-mapping-recovery')); } catch { /* unavailable */ }
    this.state = { status: recovery?.runId ? 'interrupted' : 'idle', runId: recovery?.runId || null, error: null, savedMap: null, progress: 0 };
  }
  getState = () => this.state;
  subscribe = (callback) => { this.listeners.add(callback); callback(this.state); return () => this.listeners.delete(callback); };
  emit(patch) { this.state = { ...this.state, ...patch }; this.listeners.forEach(cb => cb(this.state)); }
  async checkPrerequisites() {
    this.bridge.assertMode('indoor', 'mapping');
    this.bridge.assertAvailable('mapping.start');
    const current = this.session.getState();
    if (current.status !== 'ready' || !this.session.confirmed) throw new Error('A confirmed robot session and writable session folder are required.');
    const root = await this.storage.getRootFolder();
    if (!await this.storage.checkPermission(root)) throw new Error('Grant storage write permission in Data & Backups first.');
  }
  async startMapping() {
    try {
      await this.checkPrerequisites();
      this.bridge.assertIdle();
      const runId = crypto.randomUUID();
      const sourceSession = { ...this.session.getState().session };
      const requestId = crypto.randomUUID();
      this.bridge.localOperation = requestId;
      this.emit({ status: 'start_pending', runId, sourceSession, error: null, startTime: null });
      try { localStorage.setItem('xtrmbly-mapping-recovery', JSON.stringify({ runId, sourceSession })); } catch { /* no persistence */ }
      const result = await this.bridge.request('mapping.start', { run_id: runId }, { requestId });
      if (result?.run_id !== runId || result.state !== 'running') throw new Error('Mapping start was not confirmed.');
      this.emit({ status: 'running', startTime: Date.now() });
      this.stopMonitor?.();
      this.stopMonitor = this.bridge.subscribe(state => {
        if (!state && ['running', 'start_pending', 'finalizing'].includes(this.state.status)) this.emit({ status: 'interrupted', error: 'Robot state lost. Recover this run before continuing.' });
      });
    } catch (error) { this.emit({ status: 'failed', error: error.message }); throw error; }
  }
  async finishAndSave({ mapName = 'Indoor map' } = {}) {
    try {
      this.bridge.assertMode('indoor', 'mapping');
      if (this.state.status !== 'running') throw new Error('Mapping is not confirmed running.');
      this.emit({ status: 'finalizing', error: null });
      const result = await this.bridge.request('mapping.finish', { run_id: this.state.runId, name: mapName }, { timeoutMs: 60000 });
      return await this.receive(result);
    } catch (error) { this.emit({ status: 'interrupted', error: error.message }); throw error; }
  }
  async recover() {
    try {
      if (!this.state.runId) throw new Error('No previous run to recover.');
      const result = await this.bridge.request('mapping.recover', { run_id: this.state.runId }, { timeoutMs: 60000 });
      if (result?.state === 'running' && result.run_id === this.state.runId) {
        this.emit({ status: 'running', error: null }); return;
      }
      if (result?.state === 'canceled' && result.run_id === this.state.runId) {
        this.bridge.localOperation = null; this.emit({ status: 'idle', error: null }); return;
      }
      return await this.receive(result);
    } catch (error) { this.emit({ status: 'interrupted', error: error.message }); throw error; }
  }
  async receive(result) {
    if (result?.state !== 'artifact_ready') throw new Error('Robot has not finalized an artifact.');
    validateManifest(result.manifest);
    const sourceSession = parseSession(JSON.stringify(result.source_session));
    const source = result.manifest.source;
    if (source.run_id !== this.state.runId || source.session_id !== sourceSession.session_id || source.robot_id !== sourceSession.robot_id) throw new Error('Source run/session does not match the artifact.');
    this.emit({ status: 'transferring', error: null });
    const pkg = await this.transfer.download(result.manifest);
    this.emit({ status: 'saving' });
    const saved = await this.storage.savePackage({ manifest: pkg.manifest, files: pkg.files, sessionFolderName: sessionFolderName(sourceSession) });
    // Receipt is separate from local durability; retain the recovery key if the
    // receipt fails, so the next retry can safely acknowledge the same package.
    this.emit({ status: 'saved', savedMap: saved.manifest, progress: 100 });
    this.bridge.localOperation = null;
    this.stopMonitor?.();
    try {
      await this.bridge.request('artifact.received', { source, map_id: pkg.manifest.map_id, revision: pkg.manifest.revision, package_sha256: pkg.package_sha256 });
      localStorage.removeItem('xtrmbly-mapping-recovery');
    } catch (error) { this.emit({ error: `Saved locally; server receipt pending: ${error.message}` }); }
    return saved.manifest;
  }
  async cancel() {
    if (!this.state.runId) {
      this.bridge.localOperation = null;
      this.stopMonitor?.();
      try { localStorage.removeItem('xtrmbly-mapping-recovery'); } catch { /* ignore */ }
      this.emit({ status: 'idle', runId: null, error: null, savedMap: null });
      return;
    }
    try {
      const result = await this.bridge.request('mapping.cancel', { run_id: this.state.runId });
      if (result?.state !== 'canceled' || result.run_id !== this.state.runId) throw new Error('Cancellation not confirmed.');
      this.bridge.localOperation = null; this.stopMonitor?.();
      localStorage.removeItem('xtrmbly-mapping-recovery');
      this.emit({ status: 'idle', runId: null, error: null, savedMap: null });
    } catch (error) { this.emit({ status: 'interrupted', error: error.message }); }
  }
}
export default new MappingService();
