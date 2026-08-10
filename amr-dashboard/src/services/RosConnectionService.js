import ROSLIB from 'roslib';

/**
 * RosConnectionService
 * ---------------------
 * Single source of truth for the ROSBridge WebSocket connection.
 * Every hook/component in this app subscribes through this service —
 * there is no mock layer and no REST fallback. If ROSBridge is down,
 * connection state goes to 'error'/'closed' and consumers must render
 * "NO DATA" rather than synthesize values.
 */

const ROSBRIDGE_URL = import.meta.env.VITE_ROSBRIDGE_URL || 'ws://localhost:9090';

class RosConnectionService {
  constructor() {
    this.ros = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | error | closed
    this.statusListeners = new Set();
    this.topicCache = new Map(); // topicName -> ROSLIB.Topic
  }

  connect(url = ROSBRIDGE_URL) {
    if (this.ros) return this.ros;

    this.ros = new ROSLIB.Ros({ url });
    this._setStatus('connecting');

    this.ros.on('connection', () => this._setStatus('connected'));
    // Log the actual error payload, not just the status string (spec REQ-15) —
    // without it, a failed link gives the operator no diagnostic detail.
    this.ros.on('error', (err) => {
      console.error('[RosConnectionService] ROSBridge connection error:', err);
      this._setStatus('error');
    });
    this.ros.on('close', () => this._setStatus('closed'));

    return this.ros;
  }

  reconnect(url = ROSBRIDGE_URL) {
    this.disconnect();
    this.connect(url);
  }

  disconnect() {
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
    this.topicCache.clear();
    this._setStatus('disconnected');
  }

  _setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  /**
   * Get (or create) a cached ROSLIB.Topic instance so multiple
   * components subscribing to the same topic share one underlying
   * subscription.
   */
  getTopic({ name, messageType, throttle_rate = 0, queue_size = 1 }) {
    if (!this.ros) this.connect();
    const key = `${name}::${messageType}`;
    if (this.topicCache.has(key)) return this.topicCache.get(key);

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name,
      messageType,
      throttle_rate,
      queue_size,
    });
    this.topicCache.set(key, topic);
    return topic;
  }

  getService({ name, serviceType }) {
    if (!this.ros) this.connect();
    return new ROSLIB.Service({ ros: this.ros, name, serviceType });
  }

  getActionClient({ name, actionType }) {
    if (!this.ros) this.connect();
    return new ROSLIB.ActionClient({ ros: this.ros, serverName: name, actionName: actionType });
  }

  /**
   * Query rosbridge for the currently advertised topics.
   *
   * NOTE: the original "auto-detect which camera topic is publishing" use case
   * is dead — CameraView now streams a hardcoded VITE_WEB_VIDEO_URL (spec
   * REQ-08) and the useCameraFeed hook that used this was removed. Retained
   * only as a generic rosbridge-introspection helper for future debugging.
   */
  getTopicList() {
    return new Promise((resolve, reject) => {
      if (!this.ros) this.connect();
      this.ros.getTopics(
        (result) => resolve(result.topics || []),
        (err) => reject(err),
      );
    });
  }
}

// Singleton instance shared across the whole app
const rosService = new RosConnectionService();
export default rosService;
