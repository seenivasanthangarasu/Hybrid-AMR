/**
 * RosGraphPanel.test.jsx
 *
 * Tests for the ROS Graph panel, including:
 *  - Disconnected state (no graph refresh)
 *  - TF frame cards (stale / no-data)
 *  - /robot_mode not publishing
 *  - Node/topic/service count cards on successful graph refresh
 *  - Topics table empty-state
 *  - Raw Echo console idle state
 *
 * rosService is mocked so no real rosbridge is needed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mock the entire rosService singleton ─────────────────────────────────────
vi.mock('../../services/RosService.js', () => ({
  default: {
    status: 'disconnected',
    connect: vi.fn(),
    disconnect: vi.fn(),
    onStatusChange: vi.fn((cb) => { cb('disconnected'); return () => {}; }),
    getTopic: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      _handlers: [],
    })),
    getNodes: vi.fn().mockResolvedValue([]),
    getTopicsAndTypes: vi.fn().mockResolvedValue({ topics: [], types: [] }),
    getServices: vi.fn().mockResolvedValue([]),
  },
}));

// ── Mock useRosTopic for /robot_mode ─────────────────────────────────────────
vi.mock('../../hooks/useRosTopic.js', () => ({
  default: vi.fn(),
}));

import useRosTopic from '../../hooks/useRosTopic.js';
import rosService from '../../services/RosService.js';
import RosGraphPanel from '../../components/RosGraphPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: robot_mode not publishing
  useRosTopic.mockReturnValue({ data: null, hasData: false, stale: true, hz: '0.0' });
  // Default: disconnected
  rosService.status = 'disconnected';
  rosService.getNodes.mockResolvedValue([]);
  rosService.getTopicsAndTypes.mockResolvedValue({ topics: [], types: [] });
  rosService.getServices.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('RosGraphPanel – disconnected state', () => {
  it('shows 0 nodes/topics/services when not connected', async () => {
    render(<RosGraphPanel rosStatus="disconnected" />);
    // The count cards should all show 0 (no graph refresh fired)
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "No Odom TF" badge when TF not publishing', () => {
    render(<RosGraphPanel rosStatus="disconnected" />);
    expect(screen.getByText(/no odom tf/i)).toBeInTheDocument();
  });

  it('shows "No SLAM TF" badge when map→odom TF not publishing', () => {
    render(<RosGraphPanel rosStatus="disconnected" />);
    expect(screen.getByText(/no slam tf/i)).toBeInTheDocument();
  });

  it('shows "Not Publishing" for /robot_mode when stale', () => {
    render(<RosGraphPanel rosStatus="disconnected" />);
    expect(screen.getByText(/not publishing/i)).toBeInTheDocument();
  });
});

describe('RosGraphPanel – /robot_mode live data', () => {
  it('shows current mode value when robot_mode is live', () => {
    useRosTopic.mockReturnValue({
      data: { data: 'INDOOR' },
      hasData: true,
      stale: false,
      hz: '2.0',
    });
    render(<RosGraphPanel rosStatus="connected" />);
    expect(screen.getByText('INDOOR')).toBeInTheDocument();
  });

  it('shows Hz reading when mode is live', () => {
    useRosTopic.mockReturnValue({
      data: { data: 'OUTDOOR' },
      hasData: true,
      stale: false,
      hz: '3.5',
    });
    render(<RosGraphPanel rosStatus="connected" />);
    expect(screen.getByText(/3\.5 hz/i)).toBeInTheDocument();
  });
});

describe('RosGraphPanel – connected state with graph data', () => {
  beforeEach(() => {
    rosService.status = 'connected';
    rosService.getNodes.mockResolvedValue(['/nav_node', '/slam_node', '/odom_node']);
    rosService.getTopicsAndTypes.mockResolvedValue({
      topics: ['/scan', '/odom', '/cmd_vel'],
      types: ['sensor_msgs/LaserScan', 'nav_msgs/Odometry', 'geometry_msgs/Twist'],
    });
    rosService.getServices.mockResolvedValue(['/set_mode', '/reset_odom']);
  });

  it('shows node count after graph refresh', async () => {
    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => {
      const threeMatches = screen.getAllByText('3');
      expect(threeMatches.length).toBeGreaterThan(0);
    });
  });

  it('shows topic rows in the table', async () => {
    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => {
      expect(screen.getByText('/scan')).toBeInTheDocument();
    });
    expect(screen.getByText('/odom')).toBeInTheDocument();
    expect(screen.getByText('/cmd_vel')).toBeInTheDocument();
  });

  it('shows message type alongside each topic', async () => {
    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => {
      expect(screen.getByText('sensor_msgs/LaserScan')).toBeInTheDocument();
    });
  });
});

describe('RosGraphPanel – Topics table empty state', () => {
  it('shows "No ROS 2 topics found" when topic list is empty', async () => {
    rosService.status = 'connected';
    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => {
      expect(screen.getByText(/no ros 2 topics found/i)).toBeInTheDocument();
    });
  });

  it('filters topics by search input', async () => {
    rosService.status = 'connected';
    rosService.getTopicsAndTypes.mockResolvedValue({
      topics: ['/scan', '/odom'],
      types: ['sensor_msgs/LaserScan', 'nav_msgs/Odometry'],
    });

    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => expect(screen.getByText('/scan')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/search topics/i);
    fireEvent.change(searchInput, { target: { value: 'scan' } });

    expect(screen.queryByText('/odom')).not.toBeInTheDocument();
    expect(screen.getByText('/scan')).toBeInTheDocument();
  });
});

describe('RosGraphPanel – Raw Echo console idle state', () => {
  it('shows "Click Start Echo" message when echo is not active', () => {
    render(<RosGraphPanel rosStatus="connected" />);
    expect(screen.getByText(/click "start echo"/i)).toBeInTheDocument();
  });

  it('Start Echo button is disabled when not connected', () => {
    render(<RosGraphPanel rosStatus="disconnected" />);
    const startBtn = screen.getByRole('button', { name: /start echo/i });
    expect(startBtn).toBeDisabled();
  });

  it('"Echo Topic" button in topic table sets echo topic and starts echo', async () => {
    rosService.status = 'connected';
    rosService.getTopicsAndTypes.mockResolvedValue({
      topics: ['/scan'],
      types: ['sensor_msgs/LaserScan'],
    });

    render(<RosGraphPanel rosStatus="connected" />);
    await waitFor(() => expect(screen.getByText('/scan')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /echo topic/i }));

    // After clicking, the echo console should show "Waiting for incoming messages"
    expect(screen.getByText(/waiting for incoming messages/i)).toBeInTheDocument();
  });
});
