import ROSLIB from 'roslib';

export const getRosbridgeUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    return `ws://${host}:9090`;
  }
  return import.meta.env.VITE_ROSBRIDGE_URL || 'ws://127.0.0.1:9090';
};

class RosService {
  constructor() {
    this.ros = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed'
    this.statusListeners = new Set();
    this.topicCache = new Map();
    this.hzTrackers = new Map(); // topicName -> { count, lastTime, hz }
  }

  connect(url) {
    const targetUrl = url || getRosbridgeUrl();
    if (this.ros && (this.status === 'connected' || this.status === 'connecting')) {
      return this.ros;
    }

    this.ros = new ROSLIB.Ros({ url: targetUrl });
    this._setStatus('connecting');

    this.ros.on('connection', () => {
      this._setStatus('connected');
    });

    this.ros.on('error', () => {
      this._setStatus('error');
    });

    this.ros.on('close', () => {
      this._setStatus('closed');
    });

    return this.ros;
  }

  disconnect() {
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
    this.topicCache.clear();
    this.hzTrackers.clear();
    this._setStatus('disconnected');
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((cb) => cb(newStatus));
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

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

  // Calculate live topic update frequency (Hz)
  trackTopicHz(topicName, messageType) {
    if (!this.hzTrackers.has(topicName)) {
      const tracker = { count: 0, lastTime: Date.now(), hz: 0, topic: null };
      const topic = this.getTopic({ name: topicName, messageType });
      
      const handler = () => {
        tracker.count++;
        const now = Date.now();
        const elapsed = (now - tracker.lastTime) / 1000;
        if (elapsed >= 1.0) {
          tracker.hz = (tracker.count / elapsed).toFixed(1);
          tracker.count = 0;
          tracker.lastTime = now;
        }
      };

      topic.subscribe(handler);
      tracker.topic = topic;
      tracker.handler = handler;
      this.hzTrackers.set(topicName, tracker);
    }
    return this.hzTrackers.get(topicName)?.hz || 0;
  }

  getNodes() {
    return new Promise((resolve, reject) => {
      if (!this.ros || this.status !== 'connected') {
        return resolve([]);
      }
      this.ros.getNodes(
        (nodes) => resolve(nodes || []),
        (err) => reject(err)
      );
    });
  }

  getTopicsAndTypes() {
    return new Promise((resolve, reject) => {
      if (!this.ros || this.status !== 'connected') {
        return resolve({ topics: [], types: [] });
      }
      this.ros.getTopicsAndTypes(
        (res) => resolve(res || { topics: [], types: [] }),
        (err) => reject(err)
      );
    });
  }

  getServices() {
    return new Promise((resolve, reject) => {
      if (!this.ros || this.status !== 'connected') {
        return resolve([]);
      }
      this.ros.getServices(
        (services) => resolve(services || []),
        (err) => reject(err)
      );
    });
  }
}

const rosService = new RosService();
export default rosService;
