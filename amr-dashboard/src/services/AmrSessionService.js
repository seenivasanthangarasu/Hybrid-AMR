import ros from './RosConnectionService.js';
import storage from './McapStorageService.js';
import recorder from './McapRecordingService.js';
import camera from './CameraSnapshotService.js';

export const SESSION_TOPIC = '/amr/session';
export const SESSION_TIMEOUT_MS = 10000;

export function parseSession(data) {
  const s = JSON.parse(data);
  if (s.schema_version !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.session_id || '') ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(s.robot_id || '') ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.started_at || '') ||
      !Number.isFinite(Date.parse(s.started_at)) || new Date(s.started_at).toISOString() !== s.started_at ||
      !['active', 'ended'].includes(s.state)) throw new Error('Invalid server session message');
  return { schema_version: 1, session_id: s.session_id, robot_id: s.robot_id, started_at: s.started_at, state: s.state };
}

export function sessionFolderName(s) {
  return `${s.started_at.replace(/:/g, '-')}__${s.robot_id}__${s.session_id}`;
}

// The robot owns session identity. Connection events never create sessions.
export class AmrSessionService {
  constructor(deps = {}) {
    this.ros = deps.ros || ros;
    this.storage = deps.storage || storage;
    this.recorder = deps.recorder || recorder;
    this.camera = deps.camera || camera;
    this.listeners = new Set();
    this.state = { status: 'waiting', session: null, folderName: null, error: null };
    this.generation = 0;
    this.queue = Promise.resolve();
    this.root = null;
    this.dir = null;
  }

  getState = () => this.state;
  subscribe = (cb) => { this.listeners.add(cb); cb(this.state); return () => this.listeners.delete(cb); };
  emit(patch) { this.state = { ...this.state, ...patch }; this.listeners.forEach((cb) => cb(this.state)); }
  enqueue(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }

  start() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.ros.onStatusChange((status) => {
      if (status === 'connected' && this.epoch === this.ros.epoch && this.topic) return;
      this.topic?.unsubscribe(this.onMessage);
      this.topic = null;
      this.invalidate('waiting');
      if (status !== 'connected') return;
      this.epoch = this.ros.epoch;
      const generation = this.generation;
      this.topic = this.ros.getTopic({ name: SESSION_TOPIC, messageType: 'std_msgs/String' });
      this.onMessage = (msg) => {
        // Ignore events from a superseded connection, but allow session transitions.
        if (this.epoch !== this.ros.epoch || this.ros.status !== 'connected' || generation !== this.connectionGeneration) return;
        this.receive(msg);
      };
      this.connectionGeneration = generation;
      this.topic.subscribe(this.onMessage);
    });
  }

  invalidate(status, error = null) {
    clearTimeout(this.timer);
    this.generation += 1;
    this.confirmed = false;
    this.dir = null;
    this.camera.stop();
    // stop() synchronously unsubscribes before draining the old MCAP writer.
    const stopping = this.recorder.stop();
    this.enqueue(() => stopping).catch(() => {});
    this.emit({ status, error });
  }

  receive(msg) {
    let session;
    try { session = parseSession(msg.data); }
    catch (err) { this.invalidate('error', err.message); return; }
    const previous = this.state.session;
    const same = previous?.session_id === session.session_id && previous?.robot_id === session.robot_id;
    if (same && previous.started_at !== session.started_at) {
      this.invalidate('error', 'Server changed the start time of an existing session'); return;
    }
    if (session.state === 'ended') {
      this.invalidate('ended'); this.emit({ session }); return;
    }
    if (same && previous.state === 'ended') return;
    clearTimeout(this.timer);
    if (!same || !['ready', 'preparing', 'needs-folder', 'needs-permission'].includes(this.state.status)) {
      this.invalidate('preparing');
      this.emit({ session, folderName: sessionFolderName(session) });
      const generation = this.generation;
      this.prepare().catch((err) => {
        if (generation === this.generation) this.emit({ status: 'error', error: err.message });
      });
    }
    this.confirmed = true;
    this.lastHeartbeat = Date.now();
    this.timer = setTimeout(() => this.invalidate('stale', 'Server session heartbeat lost; recording stopped'), SESSION_TIMEOUT_MS);
  }

  async setRoot(root) {
    const confirmed = this.confirmed;
    this.invalidate('preparing');
    this.confirmed = confirmed;
    if (confirmed) this.timer = setTimeout(() => this.invalidate('stale', 'Server session heartbeat lost; recording stopped'), Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - this.lastHeartbeat)));
    this.root = root;
    await this.prepare();
  }

  async prepare() {
    const generation = this.generation;
    return this.enqueue(async () => {
      const session = this.state.session;
      if (generation !== this.generation) return;
      if (!this.confirmed || !session || session.state !== 'active' || this.ros.status !== 'connected') {
        this.emit({ status: 'waiting' }); return;
      }
      const root = this.root || await this.storage.getSavedFolder();
      if (generation !== this.generation) return;
      if (!root) { this.emit({ status: 'needs-folder' }); return; }
      if (await root.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        this.emit({ status: 'needs-permission' }); return;
      }
      const dir = await root.getDirectoryHandle(sessionFolderName(session), { create: true });
      if (generation !== this.generation) return;
      const file = await dir.getFileHandle('session.json', { create: true });
      const writer = await file.createWritable();
      await writer.write(JSON.stringify(session, null, 2));
      await writer.close();
      if (generation !== this.generation) return;
      this.root = root;
      this.dir = dir;
      this.emit({ status: 'ready', error: null });
    });
  }

  startCapture({ recording, snapshots }) {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation || this.state.status !== 'ready' || !this.dir || Date.now() - this.lastHeartbeat >= SESSION_TIMEOUT_MS) {
        throw new Error('Wait for a confirmed AMR session and writable session folder');
      }
      const dirHandle = this.dir;
      try {
        if (recording) await this.recorder.start({ ...recording, dirHandle });
        if (generation !== this.generation) throw new Error('Session changed while starting recording');
        if (snapshots) await this.camera.start({ ...snapshots, dirHandle });
        if (generation !== this.generation) throw new Error('Session changed while starting camera');
      } catch (err) {
        this.camera.stop();
        await this.recorder.stop();
        throw err;
      }
    });
  }

  stopCapture() {
    this.camera.stop();
    return this.enqueue(() => this.recorder.stop());
  }
}

export default new AmrSessionService();
