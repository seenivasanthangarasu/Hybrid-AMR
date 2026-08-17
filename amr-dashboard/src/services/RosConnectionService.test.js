import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake ROSLIB.Ros: records its handlers so a test can fire 'connection' /
// 'error' / 'close' the way a real socket would, without any network.
const hoisted = vi.hoisted(() => ({ instances: [] }));

vi.mock('roslib', () => {
  class FakeRos {
    constructor({ url }) {
      this.url = url;
      this.handlers = {};
      this.closed = false;
      hoisted.instances.push(this);
    }
    on(event, cb) {
      this.handlers[event] = cb;
    }
    emit(event, payload) {
      this.handlers[event]?.(payload);
    }
    close() {
      this.closed = true;
      this.emit('close');
    }
  }
  return { default: { Ros: FakeRos, Topic: class {}, Service: class {}, ActionClient: class {} } };
});

import rosService, { RECONNECT_MAX_ATTEMPTS } from './RosConnectionService.js';

const latest = () => hoisted.instances[hoisted.instances.length - 1];

describe('RosConnectionService bounded auto-reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.instances.length = 0;
    // The service is a module singleton — reset it to a known state per test.
    rosService.disconnect();
    rosService._random = () => 0.5; // pin the jitter: delay === nominal backoff
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries after a drop with exponential backoff', () => {
    rosService.connect('ws://robot:9090');
    latest().emit('connection');
    expect(rosService.status).toBe('connected');

    // Link drops.
    latest().emit('close');
    expect(rosService.status).toBe('closed');
    expect(rosService.retry.attempt).toBe(1);

    // Nothing happens before the first backoff window elapses.
    const madeSoFar = hoisted.instances.length;
    vi.advanceTimersByTime(900);
    expect(hoisted.instances).toHaveLength(madeSoFar);

    // ...then a fresh connection is built.
    vi.advanceTimersByTime(200);
    expect(hoisted.instances).toHaveLength(madeSoFar + 1);
    expect(rosService.status).toBe('connecting');

    // Second failure waits twice as long.
    latest().emit('close');
    expect(rosService.retry.attempt).toBe(2);
    vi.advanceTimersByTime(1900);
    expect(hoisted.instances).toHaveLength(madeSoFar + 1);
    vi.advanceTimersByTime(200);
    expect(hoisted.instances).toHaveLength(madeSoFar + 2);
  });

  it('gives up after the attempt budget instead of retrying forever', () => {
    rosService.connect();

    for (let i = 0; i < RECONNECT_MAX_ATTEMPTS; i += 1) {
      latest().emit('close');
      vi.advanceTimersByTime(60000); // past any backoff, capped at 30s
    }
    expect(rosService.retry.attempt).toBe(RECONNECT_MAX_ATTEMPTS);

    // One more failure exhausts the budget — and schedules nothing further.
    const built = hoisted.instances.length;
    latest().emit('close');
    expect(rosService.retry.exhausted).toBe(true);
    expect(rosService.retry.nextAttemptAt).toBeNull();

    vi.advanceTimersByTime(300000);
    expect(hoisted.instances).toHaveLength(built);
  });

  it('resets the budget once the link comes back', () => {
    rosService.connect();
    latest().emit('close');
    vi.advanceTimersByTime(2000);
    expect(rosService.retry.attempt).toBe(1);

    latest().emit('connection');
    expect(rosService.retry.attempt).toBe(0);
    expect(rosService.retry.exhausted).toBe(false);
  });

  it('does not auto-reconnect after an operator-initiated disconnect', () => {
    rosService.connect();
    latest().emit('connection');

    const built = hoisted.instances.length;
    rosService.disconnect(); // FakeRos.close() emits 'close' synchronously

    expect(rosService.status).toBe('disconnected');
    expect(rosService.retry.attempt).toBe(0);
    vi.advanceTimersByTime(300000);
    expect(hoisted.instances).toHaveLength(built);
  });

  it('lets a manual RECONNECT restart a spent budget', () => {
    rosService.connect();
    for (let i = 0; i <= RECONNECT_MAX_ATTEMPTS; i += 1) {
      latest().emit('close');
      vi.advanceTimersByTime(60000);
    }
    expect(rosService.retry.exhausted).toBe(true);

    rosService.reconnect();
    expect(rosService.retry.exhausted).toBe(false);
    expect(rosService.retry.attempt).toBe(0);
    expect(rosService.status).toBe('connecting');
  });

  it('bumps the epoch on every new connection so hooks resubscribe', () => {
    const before = rosService.epoch;
    rosService.connect();
    expect(rosService.epoch).toBe(before + 1);

    latest().emit('close');
    vi.advanceTimersByTime(2000);
    // A retry builds a *new* ROSLIB.Ros; subscriptions bound to the old one are
    // dead, so consumers must be told to rebuild them.
    expect(rosService.epoch).toBe(before + 2);
  });

  it('ignores late events from a superseded connection', () => {
    rosService.connect();
    const first = latest();
    first.emit('close');
    vi.advanceTimersByTime(2000);

    const second = latest();
    second.emit('connection');
    expect(rosService.status).toBe('connected');

    // The old socket finally reports its error — it must not knock the live
    // connection offline or start a competing retry.
    first.emit('error', new Error('stale socket'));
    expect(rosService.status).toBe('connected');
    expect(rosService.retry.attempt).toBe(0);
  });
});
