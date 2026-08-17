import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../hooks/useGnssQuality.js', () => ({ default: vi.fn() }));
// DataFallback reaches for the live ROS connection; the panel's own behaviour
// is what's under test, so the fallback is stubbed to a recognisable marker.
vi.mock('./DataFallback.jsx', () => ({
  default: ({ topic }) => <div data-testid="fallback">{topic}</div>,
}));

import useGnssQuality from '../hooks/useGnssQuality.js';
import GnssQualityPanel from './GnssQualityPanel.jsx';

const LIVE = { hasData: true, hasEverData: true, stale: false, lastReceivedAt: Date.now() };
const ABSENT = { hasData: false, hasEverData: false, stale: true, lastReceivedAt: null };

const TOPICS = {
  fix: '/fix',
  pvt: '/navpvt',
  dop: '/navdop',
  sat: '/navsat',
  status: '/navstatus',
  hw: '/monhw',
};

function state(overrides = {}) {
  return {
    fix: {
      ...LIVE,
      latitude: 12.9716,
      longitude: 77.5946,
      constellations: ['GPS', 'GALILEO'],
      covarianceTypeLabel: 'DIAGONAL_KNOWN',
    },
    dop: { gdop: 2.1, pdop: 1.5, tdop: 0.9, vdop: 1.3, hdop: 0.8, ndop: 0.7, edop: 0.6 },
    pdop: 1.5,
    pdopSource: '/navdop',
    estimated: { horizontal: 0.25, vertical: 0.4, speed: 0.06, heading: 15, time: 0.025 },
    derived: { sigmaE: 2, sigmaN: 2, sigmaU: 3, sigmaH: 2, drms: 2.83, twoDrms: 5.66, cep50: 2.35, r95: 4.9 },
    solution: {
      fixTypeCode: 3,
      fixType: '3D FIX',
      fixOk: true,
      differential: true,
      carrierSolutionCode: 2,
      carrierSolution: 'RTK FIXED',
      satellitesUsed: 14,
      heightMsl: 920,
      heightEllipsoid: 950,
      geoidSeparation: 30,
      utc: { text: '09:05:03', resolved: true },
    },
    receiver: { gpsFix: '3D FIX', ttffSec: 32, upTimeSec: 600 },
    rf: {
      jammingState: 'OK',
      jammingTone: 'live',
      jamIndicator: 12,
      jamPercent: 4.7,
      agcCount: 4095,
      agcPercent: 50,
      noisePerMs: 60,
      antennaStatus: 'OK',
      antennaTone: 'live',
    },
    sats: {
      satellites: [
        { gnssId: 0, svId: 5, constellation: 'GPS', cno: 46, used: true, elevation: 70, azimuth: 120 },
        { gnssId: 0, svId: 12, constellation: 'GPS', cno: 38, used: true },
        { gnssId: 2, svId: 7, constellation: 'GALILEO', cno: 20, used: false },
      ],
      visible: 3,
      tracked: 3,
      used: 2,
      meanCno: 34.7,
      maxCno: 46,
      strongCount: 1,
      constellations: [
        { name: 'GPS', visible: 2, used: 2 },
        { name: 'GALILEO', visible: 1, used: 0 },
      ],
    },
    timing: { fix: LIVE, pvt: LIVE, dop: LIVE, sat: LIVE, status: LIVE, hw: LIVE },
    topics: TOPICS,
    ...overrides,
  };
}

/** The section whose heading matches, so assertions can't match a stray label. */
function block(name) {
  return screen.getByRole('heading', { name }).closest('section');
}

describe('GnssQualityPanel', () => {
  beforeEach(() => {
    useGnssQuality.mockReset();
  });

  it('renders the DOP family with HDOP as the headline figure', () => {
    useGnssQuality.mockReturnValue(state());
    render(<GnssQualityPanel />);

    const geometry = within(block('GEOMETRY · DOP'));
    expect(geometry.getByText('0.80')).toBeInTheDocument(); // HDOP
    expect(geometry.getByText('IDEAL')).toBeInTheDocument();
    expect(geometry.getByText('1.50')).toBeInTheDocument(); // PDOP
    expect(geometry.getByText('2.10')).toBeInTheDocument(); // GDOP
    expect(geometry.getByText('1.30')).toBeInTheDocument(); // VDOP
    expect(geometry.getByText('0.90')).toBeInTheDocument(); // TDOP
  });

  it('shows CEP, R95, DRMS and the receiver hAcc estimate', () => {
    useGnssQuality.mockReturnValue(state());
    render(<GnssQualityPanel />);

    const accuracy = within(block('ACCURACY'));
    expect(accuracy.getByText('CEP (50%)')).toBeInTheDocument();
    expect(accuracy.getByText('R95 (95%)')).toBeInTheDocument();
    expect(accuracy.getByText('DRMS')).toBeInTheDocument();
    expect(accuracy.getByText('2DRMS')).toBeInTheDocument();
    // Sub-metre values render in cm so the precision is visible: 0.25 m → 25.0 cm.
    expect(accuracy.getByText('25.0')).toBeInTheDocument();
    expect(accuracy.getByText('2.35')).toBeInTheDocument(); // CEP50, in metres
    expect(accuracy.getByText('4.90')).toBeInTheDocument(); // R95
  });

  it('renders one C/N0 bar per satellite with its identifier', () => {
    useGnssQuality.mockReturnValue(state());
    render(<GnssQualityPanel />);

    const signal = within(block('SIGNAL · C/N0'));
    expect(signal.getByText('46')).toBeInTheDocument();
    expect(signal.getByText('38')).toBeInTheDocument();
    expect(signal.getByTitle(/GPS 5 · 46 dB-Hz · used in solution/)).toBeInTheDocument();
    expect(signal.getByTitle(/GALILEO 7 · 20 dB-Hz · not used/)).toBeInTheDocument();
  });

  // The count is only useful if it says whether it's enough.
  it('rates the satellite count rather than showing a bare number', () => {
    useGnssQuality.mockReturnValue(state());
    const { unmount } = render(<GnssQualityPanel />);
    expect(within(block('SOLUTION')).getByText('14 · EXCELLENT')).toBeInTheDocument();
    expect(screen.getByTitle(/14 satellites used in the solution — EXCELLENT/)).toBeInTheDocument();
    unmount();

    // A solution scraping the 3D minimum must not read as healthy.
    useGnssQuality.mockReturnValue(state({ solution: { ...state().solution, satellitesUsed: 4 } }));
    render(<GnssQualityPanel />);
    const marginal = within(block('SOLUTION')).getByText('4 · MINIMUM');
    expect(marginal).toBeInTheDocument();
    expect(marginal.className).toContain('text-signal-amber');
  });

  it('surfaces the RTK solution and RF health', () => {
    useGnssQuality.mockReturnValue(state());
    render(<GnssQualityPanel />);

    expect(within(block('SOLUTION')).getByText('RTK FIXED')).toBeInTheDocument();
    expect(within(block('SOLUTION')).getByText('3D FIX')).toBeInTheDocument();
    const rf = within(block('RF FRONT-END'));
    expect(within(rf.getByTitle(/MonHW.aStatus/)).getByText('OK')).toBeInTheDocument();
    expect(within(rf.getByTitle(/jamming state/)).getByText('OK')).toBeInTheDocument();
    expect(rf.getByText('12')).toBeInTheDocument(); // jam indicator
    expect(rf.getByText('60')).toBeInTheDocument(); // noisePerMS
  });

  // A receiver with `publish.nav.dop` off must not blank the whole panel.
  it('falls back per block, keeping live blocks rendered', () => {
    useGnssQuality.mockReturnValue(
      state({
        dop: null,
        pdop: null,
        timing: { fix: LIVE, pvt: LIVE, dop: ABSENT, sat: LIVE, status: LIVE, hw: ABSENT },
      }),
    );
    render(<GnssQualityPanel />);

    // The two unpublished sources name their own topic...
    const fallbacks = screen.getAllByTestId('fallback').map((n) => n.textContent);
    expect(fallbacks).toEqual(expect.arrayContaining(['/navdop', '/monhw']));
    expect(fallbacks).toHaveLength(2);

    // ...while the satellite block still draws real data.
    expect(within(block('SIGNAL · C/N0')).getByText('46')).toBeInTheDocument();
  });

  // The honesty rule at the component level: an absent number is NO DATA.
  it('renders NO DATA rather than zeros when fields are missing', () => {
    useGnssQuality.mockReturnValue(
      state({
        estimated: null,
        derived: null,
        fix: { ...LIVE, constellations: [], covarianceTypeLabel: 'UNKNOWN' },
      }),
    );
    render(<GnssQualityPanel />);

    const accuracy = within(block('ACCURACY'));
    expect(accuracy.getAllByText('NO DATA').length).toBeGreaterThanOrEqual(8);
    expect(accuracy.queryByText('0.00')).not.toBeInTheDocument();
    expect(accuracy.getByText('UNKNOWN')).toBeInTheDocument();
  });
});
