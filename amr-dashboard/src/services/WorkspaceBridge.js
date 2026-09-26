import ros from './RosConnectionService.js';
import session from './AmrSessionService.js';

export const HEARTBEAT_MS = 6000;
export const CHUNK_BYTES = 32768;
export const TOPICS = {
  request: '/amr/workspace/request',
  response: '/amr/workspace/response',
  state: '/amr/workspace/state',
};
const id = () => crypto.randomUUID();

// Versioned application protocol. The robot adapter owns ROS 2 actions; the
// browser never uses the ROS 1 ActionClient shipped with roslib 1.x.
export class WorkspaceBridge {
  constructor(deps = {}) {
    this.ros = deps.ros || ros;
    this.session = deps.session || session;
    this.clientId = id();
    this.pending = new Map();
    this.listeners = new Set();
    this.selection = null;
    this.state = null;
    this.lastSeen = 0;
    this.sequence = -1;
    this.localOperation = null;
    this.cleanups = [];
  }
  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  emit() { this.listeners.forEach(fn => fn(this.state)); }
  getState = () => this.state;
  identity() {
    const current = this.session.getState();
    if (!current.session || !this.session.confirmed || current.session.state !== 'active') {
      throw new Error('Wait for a confirmed active robot session.');
    }
    return { robot_id: current.session.robot_id, session_id: current.session.session_id };
  }
  start() {
    if (this.stopStatus) return;
    this.stopStatus = this.ros.onStatusChange(status => {
      this.detach();
      this.invalidate('Robot connection changed. Reconcile operation status before continuing.');
      if (status === 'connected') this.attach();
    });
    this.stopSession = this.session.subscribe(() => {
      let identity;
      try { identity = this.identity(); } catch { /* unconfirmed */ }
      if (!identity || (this.state && (this.state.session_id !== identity.session_id || this.state.robot_id !== identity.robot_id))) {
        this.invalidate('Robot session changed or is unconfirmed.');
      }
    });
    if (this.ros.status === 'connected' && !this.cleanups.length) this.attach();
  }
  attach() {
    for (const [name, callback] of [[TOPICS.response, msg => this.onResponse(msg)], [TOPICS.state, msg => this.onState(msg)]]) {
      const topic = this.ros.getTopic({ name, messageType: 'std_msgs/String', throttle_rate: 0 });
      topic.subscribe(callback);
      this.cleanups.push(() => topic.unsubscribe(callback));
    }
  }
  detach() { this.cleanups.splice(0).forEach(fn => fn()); }
  stop() {
    this.stopStatus?.(); this.stopSession?.(); this.stopStatus = null;
    this.detach(); this.invalidate('Workspace disconnected.');
  }
  invalidate(reason) {
    clearTimeout(this.heartbeat);
    this.state = null; this.lastSeen = 0; this.sequence = -1;
    for (const item of [...this.pending.values()]) item.finish(new Error(reason));
    // Retain a local operation lock on disconnect/unknown outcome. Only an
    // authoritative subsequent idle state can release it.
    this.emit();
  }
  parse(message) {
    if (typeof message?.data !== 'string' || message.data.length > 100000) return null;
    try { return JSON.parse(message.data); } catch { return null; }
  }
  onState(message) {
    const data = this.parse(message);
    let identity;
    try { identity = this.identity(); } catch { return; }
    if (!data || data.schema_version !== 1 || data.robot_id !== identity.robot_id || data.session_id !== identity.session_id ||
        !Number.isSafeInteger(data.sequence) || data.sequence <= this.sequence || !Array.isArray(data.capabilities) ||
        !['idle', 'mapping', 'navigation', 'unknown'].includes(data.operation?.state)) return;
    this.sequence = data.sequence;
    this.state = data; this.lastSeen = Date.now();
    // A heartbeat must cover all outstanding accepted requests, not a stale
    // idle snapshot emitted before the client command was processed.
    if (data.operation.state === 'idle' && this.localOperation && data.reconciled_request_ids?.includes(this.localOperation)) this.localOperation = null;
    clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => this.invalidate('Robot workspace heartbeat lost.'), HEARTBEAT_MS);
    this.emit();
  }
  onResponse(message) {
    const data = this.parse(message);
    const pending = this.pending.get(data?.request_id);
    if (!pending || data.schema_version !== 1 || data.client_id !== this.clientId || data.robot_id !== pending.robot_id ||
        data.session_id !== pending.session_id || data.op !== pending.op) return;
    if (data.ok === false) pending.finish(new Error(data.error || 'Robot rejected the request.'));
    else if (data.ok === true) pending.finish(null, data.result);
  }
  assertAvailable(capability) {
    this.identity();
    if (this.ros.status !== 'connected' || !this.state || Date.now() - this.lastSeen >= HEARTBEAT_MS) throw new Error('Workspace server unavailable: waiting for a current capability heartbeat.');
    if (!this.state.capabilities.includes(capability)) throw new Error(`Robot does not support ${capability}.`);
  }
  assertIdle() {
    if (this.localOperation || (this.state && this.state.operation.state !== 'idle')) throw new Error('An operation is active or its outcome is unknown. Stop/cancel and reconcile before switching.');
  }
  setSelection(selection) { this.selection = selection; }
  assertMode(environment, mode) {
    if (this.selection?.effectiveEnvironment !== environment || this.selection?.operatingMode !== mode) throw new Error(`This operation requires ${environment} ${mode} mode.`);
    if (this.state?.environment !== environment) throw new Error('Robot environment does not match the selected workspace.');
  }
  navigationReady(environment) {
    this.assertAvailable(environment === 'indoor' ? 'navigation.indoor' : 'navigation.outdoor');
    this.assertMode(environment, 'navigation');
    if (this.state.navigation_ready !== true) throw new Error('Robot navigation is not ready.');
    if (environment === 'indoor') {
      const selected = this.selection?.selectedMap;
      const activation = this.selection?.mapActivation;
      if (!selected || activation?.status !== 'ready' || !this.matchesMap(selected, activation.operationId)) throw new Error('Select, activate and localize the current indoor map first.');
    }
  }
  matchesMap(map, operationId) {
    const active = this.state?.active_map;
    return !!active && active.map_id === map.map_id && active.revision === map.revision &&
      active.package_sha256 === map.package_sha256 && active.operation_id === operationId &&
      this.state.localization === 'localized' && this.state.navigation_ready === true && Date.now() - this.lastSeen < HEARTBEAT_MS;
  }
  request(op, args = {}, { signal, timeoutMs = 15000, requestId = id(), capability = op } = {}) {
    try { this.assertAvailable(capability); } catch (err) { return Promise.reject(err); }
    if (signal?.aborted) return Promise.reject(new Error('Operation superseded.'));
    const identity = this.identity();
    return new Promise((resolve, reject) => {
      const abort = () => finish(new Error('Operation superseded.'));
      const finish = (err, result) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        this.pending.delete(requestId);
        err ? reject(err) : resolve(result);
      };
      const timer = setTimeout(() => finish(new Error('Robot response timed out; outcome unknown. Reconcile before retrying.')), timeoutMs);
      this.pending.set(requestId, { ...identity, op, finish });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const envelope = { schema_version: 1, ...identity, client_id: this.clientId, request_id: requestId, op, args };
        const data = JSON.stringify(envelope);
        if (data.length > 100000) throw new Error('Request exceeds bounded message size.');
        this.ros.getTopic({ name: TOPICS.request, messageType: 'std_msgs/String' }).publish({ data });
      } catch (err) { finish(err); }
    });
  }
  async reconcile() {
    await this.request('operation.reconcile', { request_id: this.localOperation });
    // Release only via a correlated idle heartbeat, not merely this reply.
  }
}
export default new WorkspaceBridge();
