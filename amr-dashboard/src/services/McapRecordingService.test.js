import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McapStreamReader } from '@mcap/core';
import { McapRecordingService } from './McapRecordingService.js';
import rosService from './RosConnectionService.js';

vi.mock('./RosConnectionService.js', () => {
  const listeners = new Set();
  const topics = new Map();
  const mock = {
    status: 'connected',
    epoch: 1,
    getTopic({ name, messageType }) {
      const key = `${name}::${messageType}`;
      if (!topics.has(key)) {
        const subs = new Set();
        topics.set(key, {
          subscribe: (h) => subs.add(h),
          unsubscribe: (h) => subs.delete(h),
          _emit: (msg) => subs.forEach((h) => h(msg)),
        });
      }
      return topics.get(key);
    },
    onStatusChange(cb) {
      listeners.add(cb);
      cb(mock.status);
      return () => listeners.delete(cb);
    },
    _setStatus(s) {
      mock.status = s;
      listeners.forEach((cb) => cb(s));
    },
    _bumpEpoch() {
      mock.epoch += 1;
    },
    _reset() {
      mock.status = 'connected';
      mock.epoch = 1;
      listeners.clear();
      topics.clear();
    },
  };
  return { default: mock };
});

function fakeDirHandle() {
  const files = new Map(); // name -> Uint8Array[]
  return {
    files,
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name)) {
        if (!create) throw new Error(`no such file: ${name}`);
        files.set(name, []);
      }
      const chunks = files.get(name);
      return {
        name,
        async createWritable() {
          return {
            async write(data) {
              chunks.push(data);
            },
            async close() {},
          };
        },
      };
    },
    async *values() {
      for (const name of files.keys()) yield { kind: 'file', name };
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
}

function readMcap(chunks) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const reader = new McapStreamReader();
  reader.append(buf);
  const records = [];
  let record;
  while ((record = reader.nextRecord())) records.push(record);
  return { records, done: reader.done() };
}

describe('McapRecordingService', () => {
  let service;

  beforeEach(() => {
    rosService._reset();
    service = new McapRecordingService();
  });

  it('start/stop lifecycle produces a valid, readable MCAP file', async () => {
    const dir = fakeDirHandle();
    const statuses = [];
    service.onStatusChange((s) => statuses.push(s));

    await service.start({
      dirHandle: dir,
      sources: [{ id: '/odom', messageType: 'nav_msgs/Odometry' }],
      prefix: 'session',
    });
    expect(service.status).toBe('recording');

    rosService.getTopic({ name: '/odom', messageType: 'nav_msgs/Odometry' })._emit({ x: 1 });
    await service._writeQueue;

    await service.stop();
    expect(service.status).toBe('stopped');
    expect(statuses).toContain('recording');
    expect(statuses).toContain('stopped');

    expect(dir.files.size).toBe(1);
    const [chunks] = dir.files.values();
    const { records, done } = readMcap(chunks);
    expect(done).toBe(true);
    const messages = records.filter((r) => r.type === 'Message');
    expect(messages).toHaveLength(1);
    expect(JSON.parse(new TextDecoder().decode(messages[0].data))).toEqual({ x: 1 });
  });

  it('gives each topic its own channel and counts messages per topic correctly', async () => {
    const dir = fakeDirHandle();
    await service.start({
      dirHandle: dir,
      sources: [
        { id: '/odom', messageType: 'nav_msgs/Odometry' },
        { id: '/scan', messageType: 'sensor_msgs/LaserScan' },
      ],
      prefix: 'session',
    });

    const odomTopic = rosService.getTopic({ name: '/odom', messageType: 'nav_msgs/Odometry' });
    const scanTopic = rosService.getTopic({ name: '/scan', messageType: 'sensor_msgs/LaserScan' });
    odomTopic._emit({ seq: 1 });
    odomTopic._emit({ seq: 2 });
    scanTopic._emit({ ranges: [] });
    await service._writeQueue;
    await service.stop();

    const [chunks] = dir.files.values();
    const { records } = readMcap(chunks);
    const channels = records.filter((r) => r.type === 'Channel');
    const messages = records.filter((r) => r.type === 'Message');

    const odomChannel = channels.find((c) => c.topic === '/odom');
    const scanChannel = channels.find((c) => c.topic === '/scan');
    expect(odomChannel).toBeDefined();
    expect(scanChannel).toBeDefined();
    expect(odomChannel.id).not.toBe(scanChannel.id);

    expect(messages.filter((m) => m.channelId === odomChannel.id)).toHaveLength(2);
    expect(messages.filter((m) => m.channelId === scanChannel.id)).toHaveLength(1);
  });

  it('pauses on disconnect, drops nothing to a live write, and resumes with gap markers', async () => {
    const dir = fakeDirHandle();
    const statuses = [];
    service.onStatusChange((s) => statuses.push(s));

    await service.start({
      dirHandle: dir,
      sources: [{ id: '/odom', messageType: 'nav_msgs/Odometry' }],
      prefix: 'session',
    });

    const odomTopic = rosService.getTopic({ name: '/odom', messageType: 'nav_msgs/Odometry' });
    odomTopic._emit({ seq: 1 });
    await service._writeQueue;

    // Link drops.
    rosService._setStatus('closed');
    await service._writeQueue;
    expect(service.status).toBe('paused');

    // A message arriving while paused (shouldn't normally happen since the
    // topic is dead too, but guards the honesty invariant either way) must
    // not be written.
    odomTopic._emit({ seq: 2 });
    await service._writeQueue;

    // Link recovers — RosConnectionService bumps epoch on every reconnect.
    rosService._bumpEpoch();
    rosService._setStatus('connected');
    await service._writeQueue;
    expect(service.status).toBe('recording');

    odomTopic._emit({ seq: 3 });
    await service._writeQueue;

    await service.stop();

    const [chunks] = dir.files.values();
    const { records } = readMcap(chunks);
    const channels = records.filter((r) => r.type === 'Channel');
    const messages = records.filter((r) => r.type === 'Message');

    const odomChannel = channels.find((c) => c.topic === '/odom');
    const gapChannel = channels.find((c) => c.topic === '/_recording_gap');
    expect(gapChannel).toBeDefined();

    // seq 1 and seq 3 land; seq 2 (sent while paused) does not.
    const odomPayloads = messages
      .filter((m) => m.channelId === odomChannel.id)
      .map((m) => JSON.parse(new TextDecoder().decode(m.data)));
    expect(odomPayloads).toEqual([{ seq: 1 }, { seq: 3 }]);

    const gapEvents = messages
      .filter((m) => m.channelId === gapChannel.id)
      .map((m) => JSON.parse(new TextDecoder().decode(m.data)).event);
    expect(gapEvents).toEqual(['disconnected', 'resumed']);

    expect(statuses).toEqual(expect.arrayContaining(['recording', 'paused', 'stopped']));
  });

  it('does not start a second session while one is already active', async () => {
    const dir = fakeDirHandle();
    await service.start({ dirHandle: dir, sources: [{ id: '/odom', messageType: 'nav_msgs/Odometry' }] });
    await service.start({ dirHandle: dir, sources: [{ id: '/scan', messageType: 'sensor_msgs/LaserScan' }] });
    expect(dir.files.size).toBe(1); // second start() was a no-op
    await service.stop();
  });

  // REQ-A3: rotation fires on the configured interval and retention never
  // lets the file count exceed the configured N, deleting oldest-first.
  it('rotates on schedule and enforces retention across several rotations', async () => {
    vi.useFakeTimers();
    try {
      const dir = fakeDirHandle();
      await service.start({
        dirHandle: dir,
        sources: [{ id: '/odom', messageType: 'nav_msgs/Odometry' }],
        prefix: 'session',
        rotationIntervalMin: 1,
        retainCount: 2,
      });

      const odomTopic = rosService.getTopic({ name: '/odom', messageType: 'nav_msgs/Odometry' });

      // Advance past 4 rotation boundaries, one minute apart, writing a
      // message and letting rotation's own async work (close+reopen+retention)
      // settle between each tick.
      for (let i = 0; i < 4; i += 1) {
        odomTopic._emit({ tick: i });
        // eslint-disable-next-line no-await-in-loop -- deliberately sequential ticks
        await service._writeQueue;
        await vi.advanceTimersByTimeAsync(60_000);
      }

      expect(dir.files.size).toBeLessThanOrEqual(2);

      const names = [...dir.files.keys()].sort();
      // Oldest-first deletion means only the two most recently created files survive.
      expect(names).toEqual(names.slice(-2));

      await service.stop();
      expect(dir.files.size).toBeLessThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
