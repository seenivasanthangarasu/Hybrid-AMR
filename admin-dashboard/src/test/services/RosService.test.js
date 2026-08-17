/**
 * RosService.test.js
 *
 * Tests for the singleton RosService that wraps roslib.
 * roslib is aliased to the manual mock via vite.config.js test.alias.
 *
 * Key design: we do NOT use vi.resetModules() because the vite alias
 * substitution only works at static import time. Instead we reset the
 * mock registries and the singleton's internal state between tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import the mock classes so tests can drive them
import { MockRos, MockTopic } from '../__mocks__/roslib.js';

// Import the singleton once — the alias makes this module use MockRos/MockTopic
import rosService from '../../services/RosService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMocks() {
  MockRos._instances = [];
  MockRos._lastInstance = null;
  MockTopic._instances = [];
}

function resetService() {
  // Force the singleton back to a clean disconnected state
  if (rosService.ros) {
    rosService.ros._listeners = {}; // silence any pending callbacks
  }
  rosService.ros = null;
  rosService.status = 'disconnected';
  rosService.statusListeners = new Set();
  rosService.topicCache = new Map();
  rosService.hzTrackers = new Map();
}

beforeEach(() => {
  resetMocks();
  resetService();
});

afterEach(() => {
  resetService();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('RosService – initial state', () => {
  it('starts in disconnected state', () => {
    expect(rosService.status).toBe('disconnected');
  });
});

describe('RosService – connect()', () => {
  it('sets status to connecting immediately on connect()', () => {
    rosService.connect('ws://localhost:9090');
    expect(rosService.status).toBe('connecting');
  });

  it('creates a MockRos instance on connect()', () => {
    rosService.connect('ws://localhost:9090');
    expect(MockRos._instances.length).toBe(1);
    expect(MockRos._lastInstance).not.toBeNull();
  });

  it('transitions to connected when rosbridge fires connection event', () => {
    rosService.connect('ws://localhost:9090');
    MockRos._lastInstance._emit('connection');
    expect(rosService.status).toBe('connected');
  });

  it('transitions to error when rosbridge fires error event', () => {
    rosService.connect('ws://localhost:9090');
    MockRos._lastInstance._emit('error');
    expect(rosService.status).toBe('error');
  });

  it('transitions to closed when rosbridge fires close event', () => {
    rosService.connect('ws://localhost:9090');
    MockRos._lastInstance._emit('close');
    expect(rosService.status).toBe('closed');
  });

  it('does not create a second Ros instance if already connecting', () => {
    rosService.connect();
    rosService.connect(); // second call should be a no-op
    expect(MockRos._instances.length).toBe(1);
  });

  it('does not create a second Ros instance if already connected', () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');
    rosService.connect();
    expect(MockRos._instances.length).toBe(1);
  });
});

describe('RosService – onStatusChange()', () => {
  it('calls listener immediately with current status on registration', () => {
    const cb = vi.fn();
    rosService.onStatusChange(cb);
    expect(cb).toHaveBeenCalledWith('disconnected');
  });

  it('calls listener on every subsequent status change', () => {
    const cb = vi.fn();
    rosService.onStatusChange(cb);
    cb.mockClear();

    rosService.connect();
    expect(cb).toHaveBeenCalledWith('connecting');

    MockRos._lastInstance._emit('connection');
    expect(cb).toHaveBeenCalledWith('connected');
  });

  it('stops calling listener after unsubscribe is called', () => {
    const cb = vi.fn();
    const unsubscribe = rosService.onStatusChange(cb);
    cb.mockClear();
    unsubscribe();

    rosService.connect();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('RosService – disconnect()', () => {
  it('closes the ros instance and sets status to disconnected', () => {
    rosService.connect();
    rosService.disconnect();
    expect(rosService.status).toBe('disconnected');
    expect(rosService.ros).toBeNull();
  });

  it('clears topic cache on disconnect', () => {
    rosService.connect();
    rosService.getTopic({ name: '/test', messageType: 'std_msgs/String' });
    expect(rosService.topicCache.size).toBe(1);
    rosService.disconnect();
    expect(rosService.topicCache.size).toBe(0);
  });
});

describe('RosService – getTopic() caching', () => {
  it('returns the same Topic instance on repeated calls with same name+type', () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');

    const t1 = rosService.getTopic({ name: '/chatter', messageType: 'std_msgs/String' });
    const t2 = rosService.getTopic({ name: '/chatter', messageType: 'std_msgs/String' });
    expect(t1).toBe(t2);
  });

  it('returns different Topic instances for different names', () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');

    const t1 = rosService.getTopic({ name: '/a', messageType: 'std_msgs/String' });
    const t2 = rosService.getTopic({ name: '/b', messageType: 'std_msgs/String' });
    expect(t1).not.toBe(t2);
  });
});

describe('RosService – getNodes() / getTopicsAndTypes() / getServices()', () => {
  it('getNodes() resolves with empty array when disconnected', async () => {
    const result = await rosService.getNodes();
    expect(result).toEqual([]);
  });

  it('getTopicsAndTypes() resolves with empty result when disconnected', async () => {
    const result = await rosService.getTopicsAndTypes();
    expect(result).toEqual({ topics: [], types: [] });
  });

  it('getServices() resolves with empty array when disconnected', async () => {
    const result = await rosService.getServices();
    expect(result).toEqual([]);
  });

  it('getNodes() resolves with nodes list when connected', async () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');
    MockRos._lastInstance._getNodesResult = ['/node_a', '/node_b'];

    const result = await rosService.getNodes();
    expect(result).toEqual(['/node_a', '/node_b']);
  });

  it('getNodes() rejects when ros returns an error', async () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');
    MockRos._lastInstance._getNodesError = new Error('ros error');

    await expect(rosService.getNodes()).rejects.toThrow('ros error');
  });

  it('getTopicsAndTypes() returns topics/types on success', async () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');
    MockRos._lastInstance._getTopicsResult = {
      topics: ['/scan'],
      types: ['sensor_msgs/LaserScan'],
    };
    const result = await rosService.getTopicsAndTypes();
    expect(result.topics).toContain('/scan');
  });

  it('getServices() returns services list on success', async () => {
    rosService.connect();
    MockRos._lastInstance._emit('connection');
    MockRos._lastInstance._getServicesResult = ['/set_mode'];
    const result = await rosService.getServices();
    expect(result).toContain('/set_mode');
  });
});
