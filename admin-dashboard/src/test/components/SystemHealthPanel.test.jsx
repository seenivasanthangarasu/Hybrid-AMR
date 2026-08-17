/**
 * SystemHealthPanel.test.jsx
 *
 * Tests for the System Health / Pi Stats panel.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemHealthPanel from '../../components/SystemHealthPanel.jsx';

const MOCK_SYSTEM = {
  cpu: {
    total_percent: 55.0,
    per_core: [50, 60],
    temp_c: 62,
    cores_count: 2,
  },
  memory: {
    total_mb: 3800,
    used_mb: 1900,
    free_mb: 1900,
    percent: 50,
  },
  disk: {
    total_gb: 58,
    used_gb: 20,
    free_gb: 38,
    percent: 34,
  },
  uptime_seconds: 7320, // 2h 2m
  hostname: 'rubikpi',
  network: [
    {
      name: 'wlan0',
      ip: '192.168.1.42',
      mac: 'de:ad:be:ef:00:01',
      is_up: true,
      bytes_sent: 1024 * 1024,
      bytes_recv: 2 * 1024 * 1024,
    },
    {
      name: 'eth0',
      ip: 'Disconnected',
      mac: 'de:ad:be:ef:00:02',
      is_up: false,
      bytes_sent: 0,
      bytes_recv: 0,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

describe('SystemHealthPanel – no data (backend offline)', () => {
  it('shows connecting message when systemData is null', () => {
    render(<SystemHealthPanel systemData={null} />);
    expect(
      screen.getByText(/connecting to python local backend api/i)
    ).toBeInTheDocument();
  });

  it('shows the server.py command hint', () => {
    render(<SystemHealthPanel systemData={null} />);
    expect(screen.getByText(/server\.py/i)).toBeInTheDocument();
  });
});

describe('SystemHealthPanel – with real system data', () => {
  it('displays CPU total percentage', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/55/)).toBeInTheDocument();
  });

  it('displays CPU temperature', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/62°C/)).toBeInTheDocument();
  });

  it('displays RAM usage percentage', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    // Multiple "50%" may appear; at least one must be present
    const fiftyMatches = screen.getAllByText(/50%/);
    expect(fiftyMatches.length).toBeGreaterThan(0);
  });

  it('displays disk usage percentage', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/34%/)).toBeInTheDocument();
  });

  it('formats uptime as "2h 2m"', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/2h 2m/)).toBeInTheDocument();
  });

  it('renders per-core CPU bars for each core', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/core #0/i)).toBeInTheDocument();
    expect(screen.getByText(/core #1/i)).toBeInTheDocument();
  });

  it('shows RAM used/total figures', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/1900 MB \/ 3800 MB/i)).toBeInTheDocument();
  });

  it('shows disk used/total figures', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText(/20 GB \/ 58 GB/i)).toBeInTheDocument();
  });
});

describe('SystemHealthPanel – network interfaces table', () => {
  it('renders wlan0 interface with its IP', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText('wlan0')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.42')).toBeInTheDocument();
  });

  it('shows UP badge for wlan0', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText('UP')).toBeInTheDocument();
  });

  it('shows DOWN badge for eth0', () => {
    render(<SystemHealthPanel systemData={MOCK_SYSTEM} />);
    expect(screen.getByText('DOWN')).toBeInTheDocument();
  });

  it('shows "No active network interfaces" when network array is empty', () => {
    const noNetData = { ...MOCK_SYSTEM, network: [] };
    render(<SystemHealthPanel systemData={noNetData} />);
    expect(screen.getByText(/no active network interfaces/i)).toBeInTheDocument();
  });
});

describe('SystemHealthPanel – temperature colour coding', () => {
  it('applies rose/danger class when temp > 75°C', () => {
    const hotData = { ...MOCK_SYSTEM, cpu: { ...MOCK_SYSTEM.cpu, temp_c: 80 } };
    render(<SystemHealthPanel systemData={hotData} />);
    expect(screen.getByText(/80°C/)).toBeInTheDocument();
  });

  it('applies amber/warning class when temp is 61–75°C', () => {
    const warmData = { ...MOCK_SYSTEM, cpu: { ...MOCK_SYSTEM.cpu, temp_c: 68 } };
    render(<SystemHealthPanel systemData={warmData} />);
    expect(screen.getByText(/68°C/)).toBeInTheDocument();
  });
});
