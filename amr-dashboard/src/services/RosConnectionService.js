import ROSLIB from 'roslib';
import { getRosbridgeUrl } from '../config/endpoints.js';

/**
 * RosConnectionService
 * ---------------------
 * Single source of truth for the ROSBridge WebSocket connection.
 * Every hook/component in this app subscribes through this service —
 * there is no mock layer and no REST fallback. If ROSBridge is down,
 * connection state goes to 'error'/'closed' and consumers must render
 * "NO DATA" rather than synthesize values.
 *
 * Auto-reconnect (spec REQ-20 follow-up): a dropped link retries on its own
 * with exponential backoff, but only a bounded number of times. The bound is
 * deliberate — a dashboard left open against a powered-down robot must not
 * hammer the network indefinitely, and a chip that says "retrying" forever
 * tells the operator nothing. After the budget is spent the service gives up
 * loudly (`retry.exhausted`) and the header's manual RECONNECT is the way back.
 */

const ROSBRIDGE_URL = getRosbridgeUrl();

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 30000;
export const RECONNECT_MAX_ATTEMPTS = 6;

// 1s → 2 → 4 → 8 → 16 → 30 (capped): ~61s of retrying before giving up.
const IDLE_RETRY = Object.freeze({
  attempt: 0,
  maxAttempts: RECONNECT_MAX_ATTEMPTS,
  nextAttemptAt: null,
  exhausted: false,
});

class RosConnectionService {
  constructor() {
    this.ros = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | error | closed
    this.statusListeners = new Set();
    this.topicCache = new Map(); // topicName -> ROSLIB.Topic

    /**
     * Incremented every time a *new* ROSLIB.Ros instance is created. Hooks that
     * capture `rosService.ros` or a cached ROSLIB.Topic in a mount-time effect
     * key that effect on `epoch`, so a reconnect rebuilds their subscriptions.
     * Without it, a successful auto-reconnect would restore the header to
     * LINKED while every panel stayed silent — the exact "looks fine but isn't"
     * failure the spec forbids.
     */
    this.epoch = 0;

    this.retry = { ...IDLE_RETRY };
    this._retryTimer = null;
    this._url = ROSBRIDGE_URL;
    this._random = Math.random; // seam so tests can pin the backoff jitter
  }

  connect(url = this._url) {
    this._url = url;
    if (this.ros) return this.ros;

    const ros = new ROSLIB.Ros({ url });
    this.ros = ros;
    this.epoch += 1;
    this._setStatus('connecting');

    // Every handler checks instance identity first. When a retry tears the old
    // socket down, its late 'close' event must not clobber the state of the new
    // connection or schedule a second retry on top of the one in flight.
    ros.on('connection', () => {
      if (this.ros !== ros) return;
      this._clearRetryTimer();
      this.retry = { ...IDLE_RETRY };
      this._setStatus('connected');
    });

    // Log the actual error payload, not just the status string (spec REQ-15) —
    // without it, a failed link gives the operator no diagnostic detail.
    ros.on('error', (err) => {
      if (this.ros !== ros) return;
      console.error('[RosConnectionService] ROSBridge connection error:', err);
      this._setStatus('error');
      this._scheduleRetry();
    });

    ros.on('close', () => {
      if (this.ros !== ros) return;
      this._setStatus('closed');
      this._scheduleRetry();
    });

    return this.ros;
  }

  /** Operator-initiated. Resets the retry budget — an explicit press means
   *  "try again properly", not "resume where the automatic attempts gave up". */
  reconnect(url = this._url) {
    this._clearRetryTimer();
    this.retry = { ...IDLE_RETRY };
    this._teardown();
    this.connect(url);
  }

  /** Operator-initiated teardown: cancels any pending retry so an intentional
   *  disconnect is not immediately undone by the auto-reconnect. */
  disconnect() {
    this._clearRetryTimer();
    this.retry = { ...IDLE_RETRY };
    this._teardown();
    this._setStatus('disconnected');
  }

  /** Snapshot for consumers: status plus the reconnect state driving the UI. */
  getState() {
    return { status: this.status, epoch: this.epoch, retry: this.retry };
  }

  _teardown() {
    const ros = this.ros;
    // Null it first: the handlers above compare against `this.ros`, so anything
    // the close below emits is ignored from this point on.
    this.ros = null;
    // Cached topics hold a reference to the dead instance; a stale one would
    // publish into a closed socket and silently never subscribe again.
    this.topicCache.clear();
    if (ros) {
      try {
        ros.close();
      } catch {
        // Socket was already gone — nothing to close.
      }
    }
  }

  _scheduleRetry() {
    if (this._retryTimer) return; // one attempt in flight at a time

    if (this.retry.attempt >= RECONNECT_MAX_ATTEMPTS) {
      this.retry = { ...this.retry, nextAttemptAt: null, exhausted: true };
      this._notify();
      return;
    }

    const attempt = this.retry.attempt + 1;
    const delay = this._backoffDelay(attempt);
    this.retry = {
      attempt,
      maxAttempts: RECONNECT_MAX_ATTEMPTS,
      nextAttemptAt: Date.now() + delay,
      exhausted: false,
    };

    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this._teardown();
      this.connect(this._url);
    }, delay);

    this._notify();
  }

  _backoffDelay(attempt) {
    const base = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    // ±15% jitter so a room full of dashboards recovering from the same network
    // blip does not retry in lockstep and re-drown rosbridge on every tick.
    return Math.round(base * (0.85 + this._random() * 0.3));
  }

  _clearRetryTimer() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  _setStatus(status) {
    this.status = status;
    this._notify();
  }

  _notify() {
    const state = this.getState();
    this.statusListeners.forEach((cb) => cb(state.status, state));
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status, this.getState());
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
