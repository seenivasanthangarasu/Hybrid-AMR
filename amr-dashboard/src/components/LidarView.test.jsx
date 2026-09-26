import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LidarView from './LidarView.jsx';
import * as useLaserScanModule from '../hooks/useLaserScan.js';
import * as proximityAlarmSoundModule from '../utils/proximityAlarmSound.js';

// Mock themeColor and freshness utils
vi.mock('../utils/themeColor.js', () => ({
  themeColor: (token) => `rgb(${token})`,
  themeRGB: () => [0, 0, 0],
  themeHex: () => '#000000',
}));

vi.mock('../hooks/useTheme.js', () => ({
  default: () => ({ theme: 'dark' }),
}));

vi.mock('../hooks/useNow.js', () => ({
  default: () => 1000,
}));

describe('LidarView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders fallback when no scan data is present', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: false,
      hasEverData: false,
      lastReceivedAt: null,
      points: [],
      minRange: null,
      nearestPoint: null,
      proximityStatus: 'NO_DATA',
      raw: null,
    });

    render(<LidarView />);
    expect(screen.getByText('/scan')).toBeInTheDocument();
    expect(screen.queryByTestId('lidar-alarm-critical')).toBeNull();
  });

  it('displays CRITICAL alarm banner when an obstacle is within 0.50m', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [
        { angle: 0.1, range: 0.35, x: 0.35, y: 0.03, sector: 'FRONT' },
      ],
      minRange: 0.35,
      nearestPoint: { angle: 0.1, range: 0.35, x: 0.35, y: 0.03, sector: 'FRONT' },
      proximityStatus: 'CRITICAL',
      raw: { range_min: 0.05, range_max: 20 },
    });

    render(<LidarView />);

    const critBanner = screen.getByTestId('lidar-alarm-critical');
    expect(critBanner).toBeInTheDocument();
    expect(critBanner).toHaveTextContent('CRITICAL: 0.35m');
    expect(critBanner).toHaveTextContent('[FRONT]');

    // Container gets critical glow class
    const root = screen.getByTestId('lidar-view-root');
    expect(root.className).toContain('ring-signal-red');
  });

  it('displays WARNING caution banner when an obstacle is between 0.50m and 1.20m', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [
        { angle: Math.PI / 4, range: 0.85, x: 0.6, y: 0.6, sector: 'FRONT-LEFT' },
      ],
      minRange: 0.85,
      nearestPoint: { angle: Math.PI / 4, range: 0.85, x: 0.6, y: 0.6, sector: 'FRONT-LEFT' },
      proximityStatus: 'WARNING',
      raw: { range_min: 0.05, range_max: 20 },
    });

    render(<LidarView />);

    const warnBanner = screen.getByTestId('lidar-alarm-warning');
    expect(warnBanner).toBeInTheDocument();
    expect(warnBanner).toHaveTextContent('CAUTION: 0.85m');
    expect(warnBanner).toHaveTextContent('[FRONT-LEFT]');

    const root = screen.getByTestId('lidar-view-root');
    expect(root.className).toContain('ring-signal-amber');
  });

  it('displays CLEAR badge when obstacles are far away (> 1.20m)', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [
        { angle: 0, range: 3.2, x: 3.2, y: 0, sector: 'FRONT' },
      ],
      minRange: 3.2,
      nearestPoint: { angle: 0, range: 3.2, x: 3.2, y: 0, sector: 'FRONT' },
      proximityStatus: 'CLEAR',
      raw: { range_min: 0.05, range_max: 20 },
    });

    render(<LidarView />);

    const clearBadge = screen.getByTestId('lidar-alarm-clear');
    expect(clearBadge).toBeInTheDocument();
    expect(clearBadge).toHaveTextContent('CLEAR');
    expect(clearBadge).toHaveTextContent('3.20m');
  });

  it('toggles audio alarm on and off with sound control button', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [{ angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' }],
      minRange: 2.0,
      nearestPoint: { angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' },
      proximityStatus: 'CLEAR',
      raw: null,
    });

    const setAlarmSoundSpy = vi.spyOn(proximityAlarmSoundModule, 'setAlarmSoundEnabled');

    render(<LidarView />);

    const toggle = screen.getByTestId('lidar-sound-toggle');
    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(setAlarmSoundSpy).toHaveBeenCalled();
  });

  it('allows switching range zoom preset in wide view', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [{ angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' }],
      minRange: 2.0,
      nearestPoint: { angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' },
      proximityStatus: 'CLEAR',
      raw: null,
    });

    render(<LidarView />);

    const btn3m = screen.getByText('3m');
    expect(btn3m).toBeInTheDocument();
    fireEvent.click(btn3m);

    expect(btn3m.className).toContain('text-signal-cyan');
  });

  it('renders space-saving range cycler button in compact mode and cycles on click', () => {
    vi.spyOn(useLaserScanModule, 'default').mockReturnValue({
      hasData: true,
      hasEverData: true,
      lastReceivedAt: 1000,
      points: [{ angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' }],
      minRange: 2.0,
      nearestPoint: { angle: 0, range: 2.0, x: 2.0, y: 0, sector: 'FRONT' },
      proximityStatus: 'CLEAR',
      raw: null,
    });

    render(<LidarView compact />);

    const cycler = screen.getByTestId('lidar-range-cycler');
    expect(cycler).toBeInTheDocument();
    expect(cycler).toHaveTextContent('5M');

    // Click cycles 5m -> 10m
    fireEvent.click(cycler);
    expect(cycler).toHaveTextContent('10M');

    // Click cycles 10m -> AUTO
    fireEvent.click(cycler);
    expect(cycler).toHaveTextContent('AUTO');
  });
});
