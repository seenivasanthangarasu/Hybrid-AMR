import { McapWriter } from '@mcap/core';
import rosService from './RosConnectionService.js';
import { uniqueBackupFileName, enforceRetention } from './BackupRotationService.js';

/**
 * McapRecordingService
 * ----------------------
 * Subscribes to a set of ROS topics through the existing
 * `RosConnectionService` (shared topicCache — no parallel subscription
 * path) and writes them to an `.mcap` file in the operator's chosen folder,
 * using JSON message/schema encoding (data-handling-nav2-tasks.md decision
 * 5 — rosbridge already delivers JS objects, so no CDR serializer is needed).
 *
 * State machine: idle -> recording -> rotating -> recording -> stopped, with
 * an additional `paused` state while the rosbridge link is down (REQ-A2's
 * connection-loss handling) — writes are suspended, not corrupted, and an
 * explicit gap marker message is written on both the pause and the resume
 * so a later reader of the file can tell data was missed and when.
 *
 * IMPORTANT: McapWriter forbids concurrent method calls (a second call
 * before the first resolves corrupts the file). Every write — a topic
 * message, a gap marker, a rotation's close+reopen — goes through
 * `_enqueueWrite` so they execute strictly one at a time, in arrival order.
 * That ordering is also what guarantees a message arriving exactly at a
 * rotation boundary lands in the correct file: anything already queued
 * finishes against the old file before the rotation's close+reopen runs,
 * and anything queued after resolves against the new one.
 */

const GAP_TOPIC = '/_recording_gap';
const JSON_SCHEMA_ENCODING = 'jsonschema';
const ANY_OBJECT_SCHEMA = new TextEncoder().encode(JSON.stringify({ type: 'object' }));
const encoder = new TextEncoder();

function nowNanos() {
  return BigInt(Date.now()) * 1_000_000n;
}

/** Adapts a FileSystemWritableFileStream to @mcap/core's IWritable. */
class FileSystemWritable {
  constructor(stream) {
    this._stream = stream;
    this._pos = 0n;
  }

  async write(data) {
    await this._stream.write(data);
    this._pos += BigInt(data.byteLength);
  }

  position() {
    return this._pos;
  }
}

class McapRecordingService {
  constructor() {
    this.status = 'idle'; // idle | recording | paused | rotating | stopped
    this._statusListeners = new Set();
    this._errorListeners = new Set();

    this._sessionActive = false;
    this._paused = false;
    this._writer = null;
    this._stream = null;
    this._dirHandle = null;
    this._prefix = 'session';
    this._sources = [];
    this._schemaIds = new Map(); // messageType -> schemaId
    this._channelIds = new Map(); // topic id -> channelId
    this._gapChannelId = null;
    this._sequences = new Map(); // channelId -> next sequence number
    this._subs = [];
    this._epoch = null;
    this._unsubConnection = null;
    this._rotationTimer = null;
    this._rotationMs = null;
    this._retainCount = null;
    this._writeQueue = Promise.resolve();
    this._currentFileName = null;
    this._startedAt = null;
  }

  onStatusChange(cb) {
    this._statusListeners.add(cb);
    cb(this.status);
    return () => this._statusListeners.delete(cb);
  }

  /** Fires when a write/rotation fails hard enough that the session had to stop. */
  onError(cb) {
    this._errorListeners.add(cb);
    return () => this._errorListeners.delete(cb);
  }

  getState() {
    return {
      status: this.status,
      currentFileName: this._currentFileName,
      startedAt: this._startedAt,
    };
  }

  /**
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {{id: string, messageType: string}[]} sources
   * @param {string} prefix - filename prefix, e.g. a topic-set label/hash
   * @param {number|null} rotationIntervalMin
   * @param {number|null} retainCount
   */
  async start({ dirHandle, sources, prefix = 'session', rotationIntervalMin = null, retainCount = null }) {
    if (this._sessionActive) return;
    if (!sources?.length) throw new Error('No topics selected to record');

    this._dirHandle = dirHandle;
    this._sources = sources;
    this._prefix = prefix;
    this._rotationMs = rotationIntervalMin ? rotationIntervalMin * 60_000 : null;
    this._retainCount = retainCount;
    this._sessionActive = true;
    this._paused = rosService.status !== 'connected';
    this._startedAt = Date.now();

    try {
      await this._openNewFile();
    } catch (err) {
      this._sessionActive = false;
      this._setStatus('stopped');
      throw err;
    }
    if (!this._sessionActive) {
      await this._enqueueWrite(() => this._closeCurrentFile());
      return;
    }
    this._subscribe();
    this._unsubConnection = rosService.onStatusChange((s) => this._handleConnectionChange(s));
    if (this._rotationMs) this._scheduleRotation();
    this._setStatus(this._paused ? 'paused' : 'recording');
  }

  async stop() {
    if (!this._sessionActive) return;
    this._sessionActive = false;
    this._clearRotationTimer();
    this._unsubscribe();
    this._unsubConnection?.();
    this._unsubConnection = null;
    await this._enqueueWrite(() => this._closeCurrentFile());
    this._setStatus('stopped');
  }

  _setStatus(status) {
    this.status = status;
    this._statusListeners.forEach((cb) => cb(status));
  }

  _enqueueWrite(fn) {
    this._writeQueue = this._writeQueue.then(fn, fn).catch((err) => this._fail(err));
    return this._writeQueue;
  }

  _fail(err) {
    console.error('[McapRecordingService] recording failed:', err);
    this._errorListeners.forEach((cb) => cb(err));
    this._sessionActive = false;
    this._clearRotationTimer();
    this._unsubscribe();
    this._unsubConnection?.();
    this._unsubConnection = null;
    this._setStatus('stopped');
  }

  async _openNewFile() {
    const fileName = uniqueBackupFileName(this._prefix, 'mcap');
    const fileHandle = await this._dirHandle.getFileHandle(fileName, { create: true });
    const stream = await fileHandle.createWritable();
    const writable = new FileSystemWritable(stream);
    const writer = new McapWriter({ writable, useStatistics: true });
    await writer.start({ library: 'amr-dashboard', profile: '' });

    this._schemaIds.clear();
    this._channelIds.clear();
    this._sequences.clear();

    for (const source of this._sources) {
      let schemaId = this._schemaIds.get(source.messageType);
      if (schemaId === undefined) {
        // eslint-disable-next-line no-await-in-loop -- MCAP writer calls must be sequential
        schemaId = await writer.registerSchema({
          name: source.messageType,
          encoding: JSON_SCHEMA_ENCODING,
          data: ANY_OBJECT_SCHEMA,
        });
        this._schemaIds.set(source.messageType, schemaId);
      }
      // eslint-disable-next-line no-await-in-loop -- MCAP writer calls must be sequential
      const channelId = await writer.registerChannel({
        topic: source.id,
        schemaId,
        messageEncoding: 'json',
        metadata: new Map(),
      });
      this._channelIds.set(source.id, channelId);
      this._sequences.set(channelId, 0);
    }

    const gapSchemaId = await writer.registerSchema({
      name: 'amr_dashboard/RecordingGap',
      encoding: JSON_SCHEMA_ENCODING,
      data: ANY_OBJECT_SCHEMA,
    });
    this._gapChannelId = await writer.registerChannel({
      topic: GAP_TOPIC,
      schemaId: gapSchemaId,
      messageEncoding: 'json',
      metadata: new Map(),
    });
    this._sequences.set(this._gapChannelId, 0);

    this._writer = writer;
    this._stream = stream;
    this._currentFileName = fileName;
  }

  async _closeCurrentFile() {
    if (!this._writer) return;
    await this._writer.end();
    await this._stream.close();
    this._writer = null;
    this._stream = null;
  }

  _subscribe() {
    this._epoch = rosService.epoch;
    this._subs = this._sources.map((source) => {
      const topic = rosService.getTopic({ name: source.id, messageType: source.messageType });
      const handler = (msg) => this._onMessage(source.id, msg);
      topic.subscribe(handler);
      return { topic, handler };
    });
  }

  _unsubscribe() {
    this._subs.forEach(({ topic, handler }) => topic.unsubscribe(handler));
    this._subs = [];
  }

  _onMessage(topicId, msg) {
    this._enqueueWrite(async () => {
      if (this._paused || !this._writer) return;
      const channelId = this._channelIds.get(topicId);
      if (channelId === undefined) return;
      const seq = this._sequences.get(channelId) ?? 0;
      this._sequences.set(channelId, seq + 1);
      const t = nowNanos();
      await this._writer.addMessage({
        channelId,
        sequence: seq,
        logTime: t,
        publishTime: t,
        data: encoder.encode(JSON.stringify(msg)),
      });
    });
  }

  _writeGapMarker(event) {
    this._enqueueWrite(async () => {
      if (!this._writer || this._gapChannelId === null) return;
      const seq = this._sequences.get(this._gapChannelId) ?? 0;
      this._sequences.set(this._gapChannelId, seq + 1);
      const t = nowNanos();
      await this._writer.addMessage({
        channelId: this._gapChannelId,
        sequence: seq,
        logTime: t,
        publishTime: t,
        data: encoder.encode(JSON.stringify({ event, at: new Date().toISOString() })),
      });
    });
  }

  _handleConnectionChange(status) {
    if (!this._sessionActive) return;
    if (status === 'connected') {
      if (!this._paused) return;
      // A reconnect replaces RosConnectionService's ROSLIB.Ros instance and
      // clears its topic cache, so subscriptions from before the drop are
      // dead and must be rebuilt against the new one.
      if (rosService.epoch !== this._epoch) {
        this._unsubscribe();
        this._subscribe();
      }
      this._paused = false;
      this._writeGapMarker('resumed');
      this._setStatus('recording');
    } else if (!this._paused) {
      this._paused = true;
      this._writeGapMarker('disconnected');
      this._setStatus('paused');
    }
  }

  async _rotate() {
    if (!this._sessionActive) return;
    this._setStatus('rotating');
    await this._enqueueWrite(async () => {
      await this._closeCurrentFile();
      await this._openNewFile();
    });
    if (this._retainCount) {
      await enforceRetention(this._dirHandle, {
        prefix: this._prefix,
        extension: 'mcap',
        retainCount: this._retainCount,
      });
    }
    if (this._sessionActive) this._setStatus(this._paused ? 'paused' : 'recording');
  }

  _scheduleRotation() {
    this._clearRotationTimer();
    if (!this._rotationMs) return;
    this._rotationTimer = setTimeout(() => {
      this._rotate().finally(() => {
        if (this._sessionActive) this._scheduleRotation();
      });
    }, this._rotationMs);
  }

  _clearRotationTimer() {
    if (this._rotationTimer) {
      clearTimeout(this._rotationTimer);
      this._rotationTimer = null;
    }
  }
}

export { McapRecordingService };

// Singleton instance shared across the app, same convention as RosConnectionService —
// one recording session at a time is the intended usage from DataHandlingPage.
const mcapRecordingService = new McapRecordingService();
export default mcapRecordingService;
