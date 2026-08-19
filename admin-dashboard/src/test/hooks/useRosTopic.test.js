/**
 * useRosTopic.test.js
 *
 * Tests for the useRosTopic custom hook.
 * roslib is aliased to the manual mock in vite.config.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('roslib', () => import('../__mocks__/roslib.js'));

import { MockRos, MockTopic } from '../__mocks__/roslib.js';

let rosService;
let useRosTopic;

beforeEach(async () => {
  vi.useFakeTimers();
  MockRos._instances = [];
  MockRos._lastInstance = null;
  MockTopic._instances = [];

  vi.resetModules();
  const svcMod = await import('../../services/RosService.js');
  rosService = svcMod.default;
  rosService.connect('ws://localhost:9090');
  if (MockRos._lastInstance) {
    MockRos._lastInstance._emit('connection');
  }

  const hookMod = await import('../../hooks/useRosTopic.js');
  useRosTopic = hookMod.default;
});

afterEach(() => {
  rosService.disconnect();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('useRosTopic – no-data / stale baseline', () => {
  it('starts with data=null, hasData=false, stale=true, hz="0.0"', () => {
    const { result } = renderHook(() =>
      useRosTopic({ name: '/scan', messageType: 'sensor_msgs/LaserScan' })
    );
    expect(result.current.data).toBeNull();
    expect(result.current.hasData).toBe(false);
    expect(result.current.stale).toBe(true);
    expect(result.current.hz).toBe('0.0');
  });
});

describe('useRosTopic – receiving a message', () => {
  it('sets data, hasData=true, stale=false after a message arrives', () => {
    const { result } = renderHook(() =>
      useRosTopic({ name: '/odom', messageType: 'nav_msgs/Odometry' })
    );

    const topic = MockTopic._instances.find((t) => t.name === '/odom');
    expect(topic).toBeDefined();

    act(() => {
      topic._publish({ header: { seq: 1 }, pose: { pose: { position: { x: 1 } } } });
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.hasData).toBe(true);
    expect(result.current.stale).toBe(false);
  });
});

describe('useRosTopic – staleness watchdog', () => {
  it('marks data as stale when no message arrives within staleMs', () => {
    const { result } = renderHook(() =>
      useRosTopic({ name: '/fix', messageType: 'sensor_msgs/NavSatFix', staleMs: 2000 })
    );

    const topic = MockTopic._instances.find((t) => t.name === '/fix');

    // Send a message to make it live
    act(() => {
      topic._publish({ latitude: 1.0, longitude: 2.0, altitude: 3.0 });
    });
    expect(result.current.stale).toBe(false);

    // Advance time past staleMs; the 1s watchdog interval fires twice
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.stale).toBe(true);
    expect(result.current.hz).toBe('0.0');
  });
});

describe('useRosTopic – Hz tracking', () => {
  it('calculates Hz after messages accumulate over >1 second', () => {
    const { result } = renderHook(() =>
      useRosTopic({ name: '/robot_mode', messageType: 'std_msgs/String' })
    );

    const topic = MockTopic._instances.find((t) => t.name === '/robot_mode');

    // Publish 10 messages over 1.2 seconds → roughly 8.3 Hz
    act(() => {
      for (let i = 0; i < 10; i++) {
        // Advance 120ms between each so elapsed > 1s after the loop
        vi.advanceTimersByTime(120);
        topic._publish({ data: 'INDOOR' });
      }
    });

    // Hz should now be a non-zero numeric string
    const hz = parseFloat(result.current.hz);
    expect(hz).toBeGreaterThan(0);
  });
});

describe('useRosTopic – cleanup', () => {
  it('unsubscribes from the topic on unmount', () => {
    const { unmount } = renderHook(() =>
      useRosTopic({ name: '/tf', messageType: 'tf2_msgs/TFMessage' })
    );

    const topic = MockTopic._instances.find((t) => t.name === '/tf');
    expect(topic._handlers.length).toBeGreaterThan(0);

    unmount();
    expect(topic._handlers.length).toBe(0);
  });
});
