import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./useRosTopic.js', () => ({ default: vi.fn() }));
vi.mock('./useGps.js', () => ({ default: vi.fn() }));

import useRosTopic from './useRosTopic.js';
import useGps from './useGps.js';
import useGnssQuality from './useGnssQuality.js';

const EMPTY = { data: null, hasData: false, stale: true, lastReceivedAt: null };

function live(data) {
  return { data, hasData: true, stale: false, lastReceivedAt: 1000 };
}

/** Serve a different payload per subscribed topic name. */
function serve(byTopic) {
  useRosTopic.mockImplementation(({ name }) => byTopic[name] ?? EMPTY);
}

function gpsFix(overrides = {}) {
  return {
    hasData: true,
    hasEverData: true,
    stale: false,
    lastReceivedAt: 1000,
    latitude: 12.9716,
    longitude: 77.5946,
    altitude: 920,
    fixStatusCode: 0,
    fixStatus: 'FIX',
    service: 1 | 8,
    covariance: [4, 0, 0, 0, 4, 0, 0, 0, 9],
    covarianceType: 2,
    ...overrides,
  };
}

const NAVPVT = {
  fix_type: 3,
  flags: 0b10000011, // gnssFixOK + diffSoln + carrSoln=2 (RTK FIXED)
  num_sv: 14,
  h_acc: 250, // mm
  v_acc: 400,
  s_acc: 60,
  head_acc: 1500000, // 1e-5 deg -> 15 deg
  t_acc: 25000000, // ns -> 0.025 s
  p_dop: 180, // x100 -> 1.8
  g_speed: 1200,
  height: 950000,
  h_msl: 920000,
  hour: 9,
  min: 5,
  sec: 3,
  valid: 0b111,
};

const NAVDOP = { g_dop: 210, p_dop: 150, t_dop: 90, v_dop: 130, h_dop: 80, n_dop: 70, e_dop: 60 };

const NAVSAT = {
  num_svs: 3,
  sv: [
    { gnss_id: 0, sv_id: 5, cno: 46, elev: 70, azim: 120, flags: 0b1001 },
    { gnss_id: 0, sv_id: 12, cno: 38, flags: 0b1001 },
    { gnss_id: 2, sv_id: 7, cno: 20, flags: 0b0001 },
  ],
};

const NAVSTATUS = { gps_fix: 3, flags: 0b11, ttff: 32000, msss: 600000 };

const MONHW = { flags: 0b1000, jam_ind: 51, agc_cnt: 4095, noise_per_ms: 60, a_status: 2, a_power: 1 };

describe('useGnssQuality', () => {
  beforeEach(() => {
    useRosTopic.mockReset();
    useGps.mockReset();
    useGps.mockReturnValue(gpsFix());
  });

  it('subscribes to the five u-blox diagnostic topics', () => {
    serve({});
    renderHook(() => useGnssQuality());
    const subscribed = useRosTopic.mock.calls.map(([args]) => [args.name, args.messageType]);
    expect(subscribed).toEqual(
      expect.arrayContaining([
        ['/navpvt', 'ublox_msgs/NavPVT'],
        ['/navdop', 'ublox_msgs/NavDOP'],
        ['/navsat', 'ublox_msgs/NavSAT'],
        ['/navstatus', 'ublox_msgs/NavSTATUS'],
        ['/monhw', 'ublox_msgs/MonHW'],
      ]),
    );
  });

  // The central honesty rule, inherited from useGps: no publisher means no
  // numbers, not zeroes.
  it('reports every block as absent when nothing publishes', () => {
    serve({});
    useGps.mockReturnValue({
      hasData: false,
      hasEverData: false,
      stale: true,
      lastReceivedAt: null,
      covariance: null,
      covarianceType: null,
      service: null,
    });

    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.dop).toBeNull();
    expect(result.current.estimated).toBeNull();
    expect(result.current.derived).toBeNull();
    expect(result.current.solution).toBeNull();
    expect(result.current.receiver).toBeNull();
    expect(result.current.rf).toBeNull();
    expect(result.current.sats).toBeNull();
    expect(result.current.pdop).toBeNull();
    expect(result.current.pdopSource).toBeNull();
  });

  it('scales the DOP family out of NavDOP', () => {
    serve({ '/navdop': live(NAVDOP) });
    const { result } = renderHook(() => useGnssQuality());
    const expected = { gdop: 2.1, pdop: 1.5, tdop: 0.9, vdop: 1.3, hdop: 0.8, ndop: 0.7, edop: 0.6 };
    expect(Object.keys(result.current.dop).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expect(result.current.dop[key]).toBeCloseTo(value);
    }
  });

  // PDOP is the one figure two messages can supply; NavDOP is the dedicated
  // source and must win, but a PVT-only receiver still gets a geometry number.
  it('prefers NavDOP for PDOP and falls back to NavPVT', () => {
    serve({ '/navdop': live(NAVDOP), '/navpvt': live(NAVPVT) });
    let { result } = renderHook(() => useGnssQuality());
    expect(result.current.pdop).toBe(1.5);
    expect(result.current.pdopSource).toBe('/navdop');

    serve({ '/navpvt': live(NAVPVT) });
    ({ result } = renderHook(() => useGnssQuality()));
    expect(result.current.pdop).toBeCloseTo(1.8);
    expect(result.current.pdopSource).toBe('/navpvt');
  });

  it('converts the NavPVT accuracy estimates into SI units', () => {
    serve({ '/navpvt': live(NAVPVT) });
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.estimated.horizontal).toBeCloseTo(0.25);
    expect(result.current.estimated.vertical).toBeCloseTo(0.4);
    expect(result.current.estimated.speed).toBeCloseTo(0.06);
    expect(result.current.estimated.heading).toBeCloseTo(15);
    expect(result.current.estimated.time).toBeCloseTo(0.025);
  });

  it('decodes the solution state including RTK and geoid separation', () => {
    serve({ '/navpvt': live(NAVPVT) });
    const { result } = renderHook(() => useGnssQuality());
    const s = result.current.solution;
    expect(s.fixType).toBe('3D FIX');
    expect(s.fixOk).toBe(true);
    expect(s.differential).toBe(true);
    expect(s.carrierSolution).toBe('RTK FIXED');
    expect(s.satellitesUsed).toBe(14);
    expect(s.heightEllipsoid).toBeCloseTo(950);
    expect(s.heightMsl).toBeCloseTo(920);
    expect(s.geoidSeparation).toBeCloseTo(30);
    expect(s.utc).toMatchObject({ text: '09:05:03', resolved: true });
  });

  it('derives CEP/R95 from the fix covariance independently of ublox_msgs', () => {
    serve({}); // no ublox topics at all
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.derived.sigmaH).toBeCloseTo(2);
    expect(result.current.derived.cep50).toBeCloseTo(2.3548);
    expect(result.current.derived.r95).toBeCloseTo(4.8954);
    expect(result.current.fix.covarianceTypeLabel).toBe('DIAGONAL_KNOWN');
    expect(result.current.fix.constellations).toEqual(['GPS', 'GALILEO']);
  });

  it('summarizes satellites from NavSAT', () => {
    serve({ '/navsat': live(NAVSAT) });
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.sats).toMatchObject({ visible: 3, used: 2, maxCno: 46 });
    expect(result.current.sats.satellites[0].svId).toBe(5);
  });

  it('decodes receiver status and RF health', () => {
    serve({ '/navstatus': live(NAVSTATUS), '/monhw': live(MONHW) });
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.receiver).toMatchObject({
      gpsFix: '3D FIX',
      fixOk: true,
      differential: true,
      ttffSec: 32,
      upTimeSec: 600,
    });
    expect(result.current.rf).toMatchObject({
      jammingState: 'WARNING',
      jammingTone: 'warn',
      jamIndicator: 51,
      antennaStatus: 'OK',
      antennaTone: 'live',
      noisePerMs: 60,
    });
    expect(result.current.rf.jamPercent).toBeCloseTo(20);
    expect(result.current.rf.agcPercent).toBeCloseTo(50, 0);
  });

  // The whole point of per-source freshness: a receiver with DOP disabled must
  // still show live satellites next to an honest NO DATA for geometry.
  it('tracks freshness per source so one dead topic does not blank the rest', () => {
    serve({ '/navsat': live(NAVSAT) });
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.timing.sat).toMatchObject({ hasData: true, hasEverData: true });
    expect(result.current.timing.dop).toMatchObject({ hasData: false, hasEverData: false });
    expect(result.current.sats.visible).toBe(3);
    expect(result.current.dop).toBeNull();
  });

  it('reads ROS1-style camelCase message fields too', () => {
    serve({
      '/navpvt': live({ fixType: 3, flags: 1, numSV: 9, hAcc: 500, pDOP: 200 }),
      '/navdop': live({ hDOP: 120, pDOP: 200 }),
      '/monhw': live({ jamInd: 255, agcCnt: 8191, aStatus: 3, noisePerMS: 90, flags: 0b1100 }),
    });
    const { result } = renderHook(() => useGnssQuality());
    expect(result.current.solution.satellitesUsed).toBe(9);
    expect(result.current.estimated.horizontal).toBeCloseTo(0.5);
    expect(result.current.dop.hdop).toBeCloseTo(1.2);
    expect(result.current.rf).toMatchObject({ antennaStatus: 'SHORT', jammingState: 'CRITICAL' });
  });
});
