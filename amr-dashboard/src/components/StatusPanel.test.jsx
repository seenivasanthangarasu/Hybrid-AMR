import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../hooks/useOdometry.js', () => ({ default: vi.fn() }));
vi.mock('../hooks/useGps.js', () => ({ default: vi.fn() }));
import useOdometry from '../hooks/useOdometry.js';
import useGps from '../hooks/useGps.js';
import StatusPanel from './StatusPanel.jsx';

const noOdom = {
  hasData: false,
  hasEverData: false,
  stale: true,
  lastReceivedAt: null,
  linearVelocity: null,
  heading: null,
  distanceTravelled: 0,
  lastRejectedJumpAt: null,
};

const noGps = {
  hasData: false,
  hasEverData: false,
  stale: true,
  lastReceivedAt: null,
  latitude: null,
  longitude: null,
  fixStatus: null,
};

function setup({ odom = {}, gps = {}, ...props } = {}) {
  useOdometry.mockReturnValue({ ...noOdom, ...odom });
  useGps.mockReturnValue({ ...noGps, ...gps });
  return render(<StatusPanel mode="OUTDOOR" connectionStatus="connected" {...props} />);
}

// The row helper renders the literal string "NO DATA" for a null value.
const rowValue = (label) =>
  screen.getByText(label).closest('div').querySelector('.data-value').textContent;

describe('StatusPanel with no telemetry', () => {
  beforeEach(() => {
    useOdometry.mockReset();
    useGps.mockReset();
  });

  // The panel must never fill an absent reading with a zero — 0.00 m/s reads
  // as "stopped", which is a different claim from "we have no idea".
  it('renders NO DATA for every absent telemetry row, not zeros', () => {
    setup();
    expect(rowValue('Heading')).toContain('NO DATA');
    expect(rowValue('Distance')).toContain('NO DATA');
    expect(rowValue('GPS Status')).toContain('NO DATA');
    expect(rowValue('Latitude')).toContain('NO DATA');
    expect(rowValue('Longitude')).toContain('NO DATA');
  });

  it('renders the hero speed placeholder rather than 0.00', () => {
    setup();
    expect(screen.getByText('Speed').closest('div').parentElement.textContent).not.toContain('0.00');
  });

  it('shows a distance of NO DATA until odometry has ever been seen', () => {
    setup({ odom: { hasEverData: false, distanceTravelled: 0 } });
    expect(rowValue('Distance')).toContain('NO DATA');
  });
});

describe('StatusPanel with live telemetry', () => {
  beforeEach(() => {
    useOdometry.mockReset();
    useGps.mockReset();
  });

  it('formats speed, heading and distance to their display precision', () => {
    setup({
      odom: {
        hasData: true,
        hasEverData: true,
        stale: false,
        lastReceivedAt: Date.now(),
        linearVelocity: 1.23456,
        heading: 91.87,
        distanceTravelled: 42.58,
      },
    });
    expect(screen.getByText('1.23')).toBeInTheDocument();
    expect(rowValue('Heading')).toContain('91.9');
    expect(rowValue('Distance')).toContain('42.6');
  });

  it('shows a distance of 0.0 once odometry has been seen but not moved', () => {
    setup({ odom: { hasData: true, hasEverData: true, stale: false, distanceTravelled: 0 } });
    expect(rowValue('Distance')).toContain('0.0');
    expect(rowValue('Distance')).not.toContain('NO DATA');
  });

  it('renders GPS coordinates at six decimal places', () => {
    setup({
      gps: {
        hasData: true,
        hasEverData: true,
        stale: false,
        lastReceivedAt: Date.now(),
        latitude: 12.9716,
        longitude: 77.5946,
        fixStatus: 'FIX',
      },
    });
    expect(rowValue('Latitude')).toContain('12.971600');
    expect(rowValue('Longitude')).toContain('77.594600');
    expect(rowValue('GPS Status')).toContain('FIX');
  });

  it('renders a zero coordinate as a real reading, not as NO DATA', () => {
    setup({
      gps: { hasData: true, hasEverData: true, stale: false, latitude: 0, longitude: 0, fixStatus: 'FIX' },
    });
    expect(rowValue('Latitude')).toContain('0.000000');
    expect(rowValue('Latitude')).not.toContain('NO DATA');
  });
});

describe('StatusPanel with stale telemetry', () => {
  beforeEach(() => {
    useOdometry.mockReset();
    useGps.mockReset();
  });

  // Stale keeps the last reading on screen (dimmed) — blanking it would lose
  // information, showing it at full weight would imply it is current.
  it('keeps the last-known values but dims them', () => {
    setup({
      odom: {
        hasData: false,
        hasEverData: true,
        stale: true,
        lastReceivedAt: Date.now() - 20000,
        linearVelocity: 0.8,
        heading: 45,
        distanceTravelled: 12,
      },
    });
    const heading = screen.getByText('Heading').closest('div').querySelector('.data-value');
    expect(heading.textContent).toContain('45.0');
    expect(heading.className).toMatch(/opacity-70/);
  });
});

describe('StatusPanel link readout', () => {
  beforeEach(() => {
    useOdometry.mockReset();
    useGps.mockReset();
  });

  it.each([
    ['connected', 'LINKED'],
    ['connecting', 'CONNECTING'],
    ['error', 'ERROR'],
    ['closed', 'CLOSED'],
    ['disconnected', 'OFFLINE'],
  ])('shows %s as %s', (status, label) => {
    setup({ connectionStatus: status });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('StatusPanel odometry resync notice', () => {
  beforeEach(() => {
    useOdometry.mockReset();
    useGps.mockReset();
  });

  // A rejected jump means the distance total just stopped tracking reality;
  // discarding it silently would leave the operator trusting a stale odometer.
  it('surfaces a rejected odometry jump with its time', () => {
    setup({
      odom: {
        hasData: true,
        hasEverData: true,
        stale: false,
        linearVelocity: 0.5,
        heading: 10,
        distanceTravelled: 5,
        lastRejectedJumpAt: new Date('2026-01-01T14:30:05'),
      },
    });
    expect(screen.getByText(/resync detected 14:30:05/)).toBeInTheDocument();
  });

  it('shows no resync notice when nothing was rejected', () => {
    setup();
    expect(screen.queryByText(/resync detected/)).not.toBeInTheDocument();
  });
});
