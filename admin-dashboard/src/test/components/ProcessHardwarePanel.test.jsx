/**
 * ProcessHardwarePanel.test.jsx
 *
 * Tests for the Process & Hardware panel, including:
 *  - serial device cards (ESP32, YDLidar)
 *  - port reachability cards
 *  - GPS telemetry widget (no-data state, live GPS fix)
 *  - managed processes grid (RUNNING / STOPPED)
 *  - restart button → confirm modal → cancel / confirm flow
 *  - restart disabled when backend is offline
 *
 * useRosTopic is mocked so we can control GPS data without a rosbridge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mock useRosTopic ──────────────────────────────────────────────────────────
// We need fine-grained control per-test, so we use vi.mock with a factory.
vi.mock('../../hooks/useRosTopic.js', () => ({
  default: vi.fn(),
}));

import useRosTopic from '../../hooks/useRosTopic.js';
import ProcessHardwarePanel from '../../components/ProcessHardwarePanel.jsx';

// ── Mock data fixtures ────────────────────────────────────────────────────────

const MOCK_STATUS_ALL_OK = {
  hardware: {
    esp32: { exists: true, accessible: true },
    ydlidar: { exists: true, accessible: true },
  },
  services: {
    rosbridge_9090: true,
    web_video_server_8080: true,
  },
  managed_processes: {
    hybrid_manager: {
      name: 'hybrid_manager',
      patterns: ['hybrid_manager.py'],
      running: true,
      pid: 1234,
      cpu_percent: 5.2,
      memory_percent: 3.1,
      uptime_seconds: 3600,
    },
    lidar_proc: {
      name: 'lidar_proc',
      patterns: ['ydlidar_ros2_driver'],
      running: false,
      pid: null,
      cpu_percent: 0,
      memory_percent: 0,
      uptime_seconds: null,
    },
  },
};

const MOCK_GPS_FIX = {
  status: { status: 0 },
  latitude: 12.9716,
  longitude: 77.5946,
  altitude: 920.5,
};

// Helper: set useRosTopic to return no GPS data
function mockGpsNoData() {
  useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, hz: '0.0' });
}

// Helper: set useRosTopic to return a live GPS fix
function mockGpsLive(fix = MOCK_GPS_FIX) {
  useRosTopic.mockReturnValue({ data: fix, hasData: true, stale: false, hz: '5.0' });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ProcessHardwarePanel – serial device cards with no statusData', () => {
  it('shows "Missing" for ESP32 when statusData is null', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={null}
        restartProcess={vi.fn()}
        backendConnected={false}
      />
    );
    // Both device cards say Missing
    const missingBadges = screen.getAllByText(/missing/i);
    expect(missingBadges.length).toBeGreaterThan(0);
  });
});

describe('ProcessHardwarePanel – serial device cards with data', () => {
  it('shows "Connected" badge for ESP32 when exists=true', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    const connectedBadges = screen.getAllByText(/connected/i);
    expect(connectedBadges.length).toBeGreaterThanOrEqual(2); // ESP32 + YDLidar both connected
  });

  it('shows "Reachable" for rosbridge when rosbridge_9090=true', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    const reachableBadges = screen.getAllByText(/reachable/i);
    expect(reachableBadges.length).toBeGreaterThan(0);
  });
});

describe('ProcessHardwarePanel – GPS widget no-data state', () => {
  it('shows "No Data / Stale" badge when GPS is not publishing', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText(/no data \/ stale/i)).toBeInTheDocument();
  });

  it('shows 0.0000000 for coordinates when no GPS data', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getAllByText('0.0000000').length).toBe(2); // lat + lon
  });
});

describe('ProcessHardwarePanel – GPS widget with live data', () => {
  it('shows "GPS Stream Active" badge when fix is live', () => {
    mockGpsLive();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText(/gps stream active/i)).toBeInTheDocument();
  });

  it('displays latitude/longitude/altitude from the fix', () => {
    mockGpsLive();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText(/12\.9716/)).toBeInTheDocument();
    expect(screen.getByText(/77\.5946/)).toBeInTheDocument();
    expect(screen.getByText(/920\.50 m/)).toBeInTheDocument();
  });

  it('decodes GPS status code 0 as "GPS Standard Fix"', () => {
    mockGpsLive({ ...MOCK_GPS_FIX, status: { status: 0 } });
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText(/gps standard fix/i)).toBeInTheDocument();
  });

  it('decodes GPS status code -1 as "No Fix"', () => {
    mockGpsLive({ ...MOCK_GPS_FIX, status: { status: -1 } });
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText(/^no fix$/i)).toBeInTheDocument();
  });
});

describe('ProcessHardwarePanel – process cards', () => {
  it('shows RUNNING badge for hybrid_manager', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('shows STOPPED badge for lidar_proc', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText('STOPPED')).toBeInTheDocument();
  });

  it('shows PID for running process', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    expect(screen.getByText('1234')).toBeInTheDocument();
  });
});

describe('ProcessHardwarePanel – restart flow', () => {
  it('opens confirm modal when Restart button is clicked', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    const restartBtns = screen.getAllByRole('button', { name: /restart/i });
    fireEvent.click(restartBtns[0]);
    expect(screen.getByText(/confirm process restart/i)).toBeInTheDocument();
  });

  it('dismisses modal when Cancel is clicked', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={true}
      />
    );
    const restartBtns = screen.getAllByRole('button', { name: /restart/i });
    fireEvent.click(restartBtns[0]);
    expect(screen.getByText(/confirm process restart/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/confirm process restart/i)).not.toBeInTheDocument();
  });

  it('calls restartProcess with the process key when Confirm is clicked', async () => {
    mockGpsNoData();
    const restartProcess = vi.fn().mockResolvedValue({ status: 'ok', message: 'done' });

    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={restartProcess}
        backendConnected={true}
      />
    );

    // Click first Restart button (hybrid_manager — the running one)
    const restartBtns = screen.getAllByRole('button', { name: /restart/i });
    fireEvent.click(restartBtns[0]);

    // Click Confirm
    fireEvent.click(screen.getByRole('button', { name: /confirm kill/i }));

    await waitFor(() => {
      expect(restartProcess).toHaveBeenCalledTimes(1);
    });
    // The process key passed should be one of our managed processes
    const [calledWith] = restartProcess.mock.calls[0];
    expect(['hybrid_manager', 'lidar_proc']).toContain(calledWith);
  });

  it('shows success feedback banner after successful restart', async () => {
    mockGpsNoData();
    const restartProcess = vi.fn().mockResolvedValue({ status: 'ok', message: 'Restart signal sent' });

    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={restartProcess}
        backendConnected={true}
      />
    );

    const restartBtns = screen.getAllByRole('button', { name: /restart/i });
    fireEvent.click(restartBtns[0]);
    fireEvent.click(screen.getByRole('button', { name: /confirm kill/i }));

    await waitFor(() => {
      expect(screen.getByText(/restart signal sent/i)).toBeInTheDocument();
    });
  });

  it('Restart button is disabled when backendConnected is false', () => {
    mockGpsNoData();
    render(
      <ProcessHardwarePanel
        statusData={MOCK_STATUS_ALL_OK}
        restartProcess={vi.fn()}
        backendConnected={false}
      />
    );
    const restartBtns = screen.getAllByRole('button', { name: /restart/i });
    restartBtns.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
