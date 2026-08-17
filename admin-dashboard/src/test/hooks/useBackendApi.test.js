/**
 * useBackendApi.test.js
 *
 * Tests for the useBackendApi polling hook.
 * We mock the global fetch to avoid real network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_SYSTEM = {
  status: 'ok',
  cpu: { total_percent: 32.5, per_core: [30, 35], temp_c: 55, cores_count: 4 },
  memory: { total_mb: 3800, used_mb: 1200, free_mb: 2600, percent: 31.6 },
  disk: { total_gb: 58, used_gb: 20, free_gb: 38, percent: 34.5 },
  uptime_seconds: 7200,
  hostname: 'rubikpi',
  network: [],
};

const MOCK_STATUS = {
  status: 'ok',
  hardware: {
    esp32: { exists: true, accessible: true },
    ydlidar: { exists: false, accessible: false },
  },
  services: { rosbridge_9090: true, web_video_server_8080: false },
  managed_processes: {},
};

function makeFetchOk(sysBody = MOCK_SYSTEM, statusBody = MOCK_STATUS) {
  return vi.fn().mockImplementation((url) => {
    if (url.includes('/api/system')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sysBody) });
    }
    if (url.includes('/api/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(statusBody) });
    }
    if (url.includes('/api/process/restart')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', message: 'restarted', killed_pids: [1234] }),
      });
    }
    if (url.includes('/api/logs')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', source: 'ros', lines: ['line 1', 'line 2'] }),
      });
    }
    return Promise.reject(new Error('Unexpected URL'));
  });
}

// ─────────────────────────────────────────────────────────────────────────────

let useBackendApi;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const mod = await import('../../hooks/useBackendApi.js');
  useBackendApi = mod.default;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('useBackendApi – backend reachable', () => {
  it('sets backendConnected=true and populates systemData/statusData on success', async () => {
    global.fetch = makeFetchOk();

    const { result } = renderHook(() => useBackendApi(5000));

    await waitFor(() => expect(result.current.backendConnected).toBe(true));

    expect(result.current.systemData).toMatchObject({ cpu: { total_percent: 32.5 } });
    expect(result.current.statusData).toMatchObject({ hardware: { esp32: { exists: true } } });
  });
});

describe('useBackendApi – backend unreachable', () => {
  it('sets backendConnected=false and keeps systemData null when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { result } = renderHook(() => useBackendApi(5000));

    await waitFor(() => expect(result.current.backendConnected).toBe(false));
    expect(result.current.systemData).toBeNull();
    expect(result.current.error).toMatch(/ECONNREFUSED/);
  });

  it('sets backendConnected=false when server returns non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useBackendApi(5000));

    await waitFor(() => expect(result.current.backendConnected).toBe(false));
  });
});

describe('useBackendApi – polling lifecycle', () => {
  it('polls at the given interval', async () => {
    const fetchMock = makeFetchOk();
    global.fetch = fetchMock;

    renderHook(() => useBackendApi(2000));

    // Initial fetch: 2 calls (system + status)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Advance by one poll interval → another 2 calls
    act(() => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it('clears interval on unmount', async () => {
    global.fetch = makeFetchOk();
    const { unmount } = renderHook(() => useBackendApi(2000));
    await waitFor(() => {});

    const callCount = global.fetch.mock.calls.length;
    unmount();

    act(() => { vi.advanceTimersByTime(10000); });
    // No additional calls after unmount
    expect(global.fetch.mock.calls.length).toBe(callCount);
  });
});

describe('useBackendApi – restartProcess()', () => {
  it('POSTs { process: <name> } to /api/process/restart', async () => {
    global.fetch = makeFetchOk();
    const { result } = renderHook(() => useBackendApi(5000));
    await waitFor(() => expect(result.current.backendConnected).toBe(true));

    let response;
    await act(async () => {
      response = await result.current.restartProcess('hybrid_manager');
    });

    // Find the restart call
    const restartCall = global.fetch.mock.calls.find(([url]) =>
      url.includes('/api/process/restart')
    );
    expect(restartCall).toBeDefined();
    const [url, opts] = restartCall;
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ process: 'hybrid_manager' });
    expect(response.status).toBe('ok');
    expect(response.killed_pids).toEqual([1234]);
  });

  it('returns error object when fetch throws', async () => {
    global.fetch = makeFetchOk();
    const { result } = renderHook(() => useBackendApi(5000));
    await waitFor(() => expect(result.current.backendConnected).toBe(true));

    // Override fetch to fail for the restart call only
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    let response;
    await act(async () => {
      response = await result.current.restartProcess('lidar_proc');
    });
    expect(response.status).toBe('error');
    expect(response.message).toMatch(/network down/);
  });
});

describe('useBackendApi – fetchLogs()', () => {
  it('calls /api/logs with correct source, lines, filter params', async () => {
    global.fetch = makeFetchOk();
    const { result } = renderHook(() => useBackendApi(5000));
    await waitFor(() => expect(result.current.backendConnected).toBe(true));

    let lines;
    await act(async () => {
      lines = await result.current.fetchLogs('journalctl', 200, 'error');
    });

    const logsCall = global.fetch.mock.calls.find(([url]) => url.includes('/api/logs'));
    expect(logsCall).toBeDefined();
    const [url] = logsCall;
    expect(url).toContain('source=journalctl');
    expect(url).toContain('lines=200');
    expect(url).toContain('filter=error');
    expect(lines).toEqual(['line 1', 'line 2']);
  });

  it('returns error string array when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useBackendApi(5000));

    let lines;
    await act(async () => {
      lines = await result.current.fetchLogs('ros', 100, '');
    });
    expect(lines[0]).toMatch(/Error fetching logs/);
  });

  it('returns error string when server responds non-ok', async () => {
    global.fetch = makeFetchOk();
    const { result } = renderHook(() => useBackendApi(5000));
    await waitFor(() => expect(result.current.backendConnected).toBe(true));

    // Override to return non-ok for logs
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    let lines;
    await act(async () => {
      lines = await result.current.fetchLogs('ros', 100, '');
    });
    expect(lines[0]).toMatch(/503/);
  });
});
