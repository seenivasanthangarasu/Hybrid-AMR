import { describe, it, expect } from 'vitest';
import {
  CEP50_K,
  R95_K,
  SAT_MIN_3D,
  accuracyFromCovariance,
  agcPercent,
  antennaStatusLabel,
  antennaStatusTone,
  bits,
  carrierSolutionLabel,
  cnoQuality,
  constellationName,
  covarianceTypeLabel,
  decodePvtFlags,
  decodeSvFlags,
  dopQuality,
  field,
  fixTypeLabel,
  fixed,
  formatDistance,
  jamPercent,
  jammingStateLabel,
  jammingTone,
  mmToM,
  pvtUtcTime,
  satCountQuality,
  scaledDegrees,
  serviceLabels,
  summarizeSatellites,
} from './gnss.js';

describe('field / bits', () => {
  it('reads either the ROS1 camelCase or the ROS2 snake_case spelling', () => {
    expect(field({ h_acc: 1200 }, 'h_acc', 'hAcc')).toBe(1200);
    expect(field({ hAcc: 1200 }, 'h_acc', 'hAcc')).toBe(1200);
    expect(field({}, 'h_acc', 'hAcc')).toBeUndefined();
    expect(field(null, 'h_acc')).toBeUndefined();
  });

  // A real zero must survive: 0 satellites and 0 jamming are meaningful values.
  it('treats 0 as present but null/undefined as absent', () => {
    expect(field({ cno: 0 }, 'cno')).toBe(0);
    expect(field({ cno: null, cnoAlt: 5 }, 'cno', 'cnoAlt')).toBe(5);
  });

  it('extracts bit ranges', () => {
    expect(bits(0b1101, 0)).toBe(1);
    expect(bits(0b1101, 1)).toBe(0);
    expect(bits(0b11000000, 6, 7)).toBe(3);
    expect(bits(undefined, 0)).toBeNull();
  });
});

describe('scaling', () => {
  it('converts mm to m and 1e-7 deg to deg, keeping absent as null', () => {
    expect(mmToM(1500)).toBeCloseTo(1.5);
    expect(mmToM(0)).toBe(0);
    expect(mmToM(undefined)).toBeNull();
    expect(scaledDegrees(129716000)).toBeCloseTo(12.9716);
    expect(scaledDegrees(null)).toBeNull();
  });
});

describe('dopQuality', () => {
  it.each([
    [0.8, 'IDEAL', 'live'],
    [1.5, 'EXCELLENT', 'live'],
    [3.0, 'GOOD', 'live'],
    [7.0, 'MODERATE', 'warn'],
    [15.0, 'FAIR', 'warn'],
    [25.0, 'POOR', 'critical'],
  ])('rates DOP %f as %s', (dop, label, tone) => {
    expect(dopQuality(dop)).toMatchObject({ label, tone });
  });

  it('rates an absent or non-positive DOP as idle with no label', () => {
    expect(dopQuality(null)).toEqual({ label: null, tone: 'idle' });
    expect(dopQuality(0)).toEqual({ label: null, tone: 'idle' });
    expect(dopQuality(NaN)).toEqual({ label: null, tone: 'idle' });
  });
});

describe('satCountQuality', () => {
  it.each([
    [12, 'EXCELLENT', 'live'],
    [9, 'EXCELLENT', 'live'],
    [8, 'GOOD', 'live'],
    [7, 'GOOD', 'live'],
    [6, 'FAIR', 'warn'],
    [5, 'FAIR', 'warn'],
    [4, 'MINIMUM', 'warn'],
    [3, 'INSUFFICIENT', 'critical'],
    [1, 'INSUFFICIENT', 'critical'],
    [0, 'NONE', 'critical'],
  ])('rates %i satellites as %s', (used, label, tone) => {
    expect(satCountQuality(used)).toMatchObject({ label, tone });
  });

  // Four is the arithmetic minimum for a 3D fix, so it must never read as
  // healthy — a solution with no redundancy is one obstruction from dropping.
  it('never rates the bare 3D minimum as good', () => {
    expect(satCountQuality(SAT_MIN_3D).tone).toBe('warn');
    expect(satCountQuality(SAT_MIN_3D - 1).tone).toBe('critical');
  });

  it('has no opinion when the count is unknown', () => {
    expect(satCountQuality(null)).toEqual({ label: null, tone: 'idle' });
    expect(satCountQuality(undefined)).toEqual({ label: null, tone: 'idle' });
    expect(satCountQuality(-1)).toEqual({ label: null, tone: 'idle' });
  });
});

describe('cnoQuality', () => {
  it.each([
    [48, 'STRONG'],
    [42, 'GOOD'],
    [36, 'FAIR'],
    [28, 'WEAK'],
    [10, 'POOR'],
    [0, 'POOR'],
  ])('rates %i dB-Hz as %s', (cno, label) => {
    expect(cnoQuality(cno).label).toBe(label);
  });

  it('has no opinion on an absent C/N0', () => {
    expect(cnoQuality(null)).toEqual({ label: null, tone: 'idle' });
  });
});

describe('accuracyFromCovariance', () => {
  // σE = 2, σN = 2 → σH = 2, and the standard radii follow from it.
  const isotropic = [4, 0, 0, 0, 4, 0, 0, 0, 9];

  it('derives the standard horizontal radii from the covariance diagonal', () => {
    const a = accuracyFromCovariance(isotropic, 2);
    expect(a.sigmaE).toBeCloseTo(2);
    expect(a.sigmaN).toBeCloseTo(2);
    expect(a.sigmaU).toBeCloseTo(3);
    expect(a.sigmaH).toBeCloseTo(2);
    expect(a.drms).toBeCloseTo(2 * Math.SQRT2);
    expect(a.twoDrms).toBeCloseTo(4 * Math.SQRT2);
    expect(a.cep50).toBeCloseTo(2 * CEP50_K);
    expect(a.r95).toBeCloseTo(2 * R95_K);
  });

  it('orders the radii CEP50 < DRMS < R95 < 2DRMS', () => {
    const a = accuracyFromCovariance(isotropic, 2);
    expect(a.cep50).toBeLessThan(a.drms);
    expect(a.drms).toBeLessThan(a.r95);
    expect(a.r95).toBeLessThan(a.twoDrms);
  });

  // The honesty rule: no covariance means no accuracy figure, not a
  // confident zero.
  it('returns null when the covariance is unknown, absent, short or all-zero', () => {
    expect(accuracyFromCovariance(isotropic, 0)).toBeNull();
    expect(accuracyFromCovariance(null, 2)).toBeNull();
    expect(accuracyFromCovariance([1, 0, 0], 2)).toBeNull();
    expect(accuracyFromCovariance([0, 0, 0, 0, 0, 0, 0, 0, 0], 2)).toBeNull();
  });

  it('still returns horizontal radii when only the vertical variance is missing', () => {
    const a = accuracyFromCovariance([1, 0, 0, 0, 1, 0, 0, 0, -1], 1);
    expect(a.sigmaH).toBeCloseTo(1);
    expect(a.sigmaU).toBeNull();
  });

  it('labels the covariance type', () => {
    expect(covarianceTypeLabel(0)).toBe('UNKNOWN');
    expect(covarianceTypeLabel(3)).toBe('KNOWN');
    expect(covarianceTypeLabel(9)).toBeNull();
  });
});

describe('solution vocabulary', () => {
  it('labels fix types and leaves an out-of-range code UNKNOWN', () => {
    expect(fixTypeLabel(0)).toBe('NO FIX');
    expect(fixTypeLabel(3)).toBe('3D FIX');
    expect(fixTypeLabel(4)).toBe('GNSS + DR');
    expect(fixTypeLabel(9)).toBe('UNKNOWN');
    expect(fixTypeLabel(null)).toBeNull();
  });

  it('labels the RTK carrier solution', () => {
    expect(carrierSolutionLabel(0)).toBe('NONE');
    expect(carrierSolutionLabel(1)).toBe('RTK FLOAT');
    expect(carrierSolutionLabel(2)).toBe('RTK FIXED');
  });

  it('decodes the NavPVT flags byte', () => {
    // gnssFixOK | diffSoln | carrSoln = 2 (RTK FIXED) in bits 6-7
    const flags = 0b10000011;
    expect(decodePvtFlags(flags)).toMatchObject({ fixOk: true, diffSoln: true, carrSoln: 2 });
    expect(decodePvtFlags(undefined).fixOk).toBeNull();
  });

  it('decodes the NavSatFix constellation bitmask', () => {
    expect(serviceLabels(1)).toEqual(['GPS']);
    expect(serviceLabels(1 | 8)).toEqual(['GPS', 'GALILEO']);
    expect(serviceLabels(0)).toEqual([]);
    expect(serviceLabels(undefined)).toEqual([]);
  });
});

describe('summarizeSatellites', () => {
  const svs = [
    { gnss_id: 0, sv_id: 5, cno: 46, elev: 70, azim: 120, flags: 0b1001 }, // used
    { gnss_id: 0, sv_id: 12, cno: 38, elev: 30, azim: 200, flags: 0b1001 }, // used
    { gnss_id: 2, sv_id: 7, cno: 22, elev: 10, azim: 300, flags: 0b0001 }, // tracked, unused
    { gnss_id: 6, sv_id: 21, cno: 0, elev: 5, azim: 15, flags: 0b0000 }, // known, no signal
  ];

  it('sorts strongest-first and counts visible / tracked / used', () => {
    const s = summarizeSatellites(svs);
    expect(s.satellites.map((x) => x.svId)).toEqual([5, 12, 7, 21]);
    expect(s.visible).toBe(4);
    expect(s.tracked).toBe(3);
    expect(s.used).toBe(2);
  });

  // A satellite the receiver hears nothing from must not drag the mean down —
  // the mean answers "how strong are the signals we have".
  it('averages only satellites actually carrying signal', () => {
    const s = summarizeSatellites(svs);
    expect(s.meanCno).toBeCloseTo((46 + 38 + 22) / 3);
    expect(s.maxCno).toBe(46);
    expect(s.strongCount).toBe(1); // only the 46 dB-Hz signal is >= 40
  });

  it('groups by constellation with used/visible counts', () => {
    const s = summarizeSatellites(svs);
    expect(s.constellations).toEqual([
      { name: 'GPS', visible: 2, used: 2 },
      { name: 'GALILEO', visible: 1, used: 0 },
      { name: 'GLONASS', visible: 1, used: 0 },
    ]);
  });

  it('accepts the ROS1 camelCase spelling of the satellite fields', () => {
    const s = summarizeSatellites([{ gnssId: 3, svId: 9, cno: 41, flags: 0b1000 }]);
    expect(s.satellites[0]).toMatchObject({ constellation: 'BEIDOU', svId: 9, used: true });
  });

  it('handles an absent satellite list without inventing satellites', () => {
    const s = summarizeSatellites(undefined);
    expect(s.visible).toBe(0);
    expect(s.meanCno).toBeNull();
    expect(s.maxCno).toBeNull();
    expect(s.satellites).toEqual([]);
  });

  it('names unknown constellation ids OTHER', () => {
    expect(constellationName(0)).toBe('GPS');
    expect(constellationName(7)).toBe('NAVIC');
    expect(constellationName(42)).toBe('OTHER');
  });

  it('decodes per-satellite flags', () => {
    // qualityInd=5, svUsed=1, health=1 (healthy), diffCorr=1
    expect(decodeSvFlags(0b1011101)).toMatchObject({ qualityInd: 5, used: true, health: 1, diffCorr: true });
  });
});

describe('RF front-end', () => {
  it('labels and tones the antenna status', () => {
    expect(antennaStatusLabel(2)).toBe('OK');
    expect(antennaStatusTone(2)).toBe('live');
    expect(antennaStatusLabel(3)).toBe('SHORT');
    expect(antennaStatusTone(3)).toBe('critical');
    expect(antennaStatusTone(4)).toBe('critical');
    expect(antennaStatusTone(1)).toBe('idle');
    expect(antennaStatusLabel(9)).toBeNull();
  });

  it('labels and tones the jamming state', () => {
    expect(jammingStateLabel(1)).toBe('OK');
    expect(jammingTone(1)).toBe('live');
    expect(jammingStateLabel(2)).toBe('WARNING');
    expect(jammingTone(2)).toBe('warn');
    expect(jammingTone(3)).toBe('critical');
    expect(jammingTone(0)).toBe('idle');
  });

  it('scales AGC and the jamming indicator to percentages', () => {
    expect(agcPercent(8191)).toBeCloseTo(100);
    expect(agcPercent(0)).toBe(0);
    expect(agcPercent(null)).toBeNull();
    expect(jamPercent(255)).toBeCloseTo(100);
    expect(jamPercent(51)).toBeCloseTo(20);
    expect(jamPercent(undefined)).toBeNull();
  });
});

describe('formatting', () => {
  it('shows sub-metre accuracy in cm and larger values in m', () => {
    expect(formatDistance(0.023)).toEqual({ value: '2.3', unit: 'cm' });
    expect(formatDistance(1.5)).toEqual({ value: '1.50', unit: 'm' });
    expect(formatDistance(250)).toEqual({ value: '250', unit: 'm' });
    expect(formatDistance(null)).toBeNull();
  });

  it('returns null rather than "NaN" from fixed()', () => {
    expect(fixed(1.234, 2)).toBe('1.23');
    expect(fixed(undefined)).toBeNull();
    expect(fixed(NaN)).toBeNull();
  });

  it('reports NavPVT UTC time with its validity flags', () => {
    const t = pvtUtcTime({ hour: 9, min: 5, sec: 3, valid: 0b111 });
    expect(t).toMatchObject({ text: '09:05:03', dateOk: true, timeOk: true, resolved: true });
    expect(pvtUtcTime({ hour: 9, min: 5, sec: 3, valid: 0 }).resolved).toBe(false);
    expect(pvtUtcTime({})).toBeNull();
  });
});
