/**
 * Manual mock for 'roslib'.
 * Placed here so vi.mock('roslib') picks it up in every test file.
 *
 * MockRos  – captures .on() listeners; exposes ._emit() helper.
 * MockTopic – captures .subscribe() handlers; exposes ._publish() helper.
 */

export class MockRos {
  constructor({ url } = {}) {
    this.url = url;
    this._listeners = {};
    this._closed = false;
    MockRos._lastInstance = this;
    MockRos._instances.push(this);
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  /** Fire event to simulate rosbridge events */
  _emit(event, ...args) {
    (this._listeners[event] || []).forEach((cb) => cb(...args));
  }

  close() {
    this._closed = true;
    this._emit('close');
  }

  getNodes(onSuccess, onError) {
    if (this._getNodesResult !== undefined) onSuccess(this._getNodesResult);
    else if (this._getNodesError) onError(this._getNodesError);
  }

  getTopicsAndTypes(onSuccess, onError) {
    if (this._getTopicsResult !== undefined) onSuccess(this._getTopicsResult);
    else if (this._getTopicsError) onError(this._getTopicsError);
  }

  getServices(onSuccess, onError) {
    if (this._getServicesResult !== undefined) onSuccess(this._getServicesResult);
    else if (this._getServicesError) onError(this._getServicesError);
  }
}
MockRos._instances = [];
MockRos._lastInstance = null;

export class MockTopic {
  constructor(opts) {
    this.name = opts?.name;
    this.messageType = opts?.messageType;
    this._handlers = [];
    MockTopic._instances.push(this);
  }

  subscribe(handler) { this._handlers.push(handler); }

  unsubscribe(handler) {
    this._handlers = this._handlers.filter((h) => h !== handler);
  }

  /** Push a message to all current subscribers */
  _publish(msg) { this._handlers.forEach((h) => h(msg)); }
}
MockTopic._instances = [];

const ROSLIB = { Ros: MockRos, Topic: MockTopic };
export default ROSLIB;
