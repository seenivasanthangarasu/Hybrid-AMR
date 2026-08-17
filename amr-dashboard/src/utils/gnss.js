/**
 * GNSS quality vocabulary and maths.
 *
 * A NavSatFix carries a position and almost nothing about how much to trust
 * it. Everything an operator needs to judge a fix — dilution of precision,
 * per-satellite signal strength, estimated accuracy, RF interference — lives
 * in the receiver's own messages (u-blox `ublox_msgs/*`), so this module holds
 * the field decoding, unit scaling and rating thresholds for those.
 *
 * TERMINOLOGY (worth being precise about, because the field names get mixed up):
 *
 *   C/N0  — carrier-to-noise-density ratio, dB-Hz, per satellite. This is the
 *           GNSS equivalent of "signal strength"; it is NOT RSSI. RSSI is a
 *           wideband received-power figure used by WiFi/LoRa/cellular radios.
 *           A GNSS signal arrives ~20 dB BELOW the thermal noise floor, so
 *           received power is meaningless on its own and receivers report the
 *           post-correlation C/N0 instead. u-blox reports it as `cno` in
 *           NavSAT, 0–63 dB-Hz.
 *   DOP   — dilution of precision: a unitless geometry multiplier. Position
 *           error ≈ DOP × ranging error. HDOP is the horizontal component;
 *           the family is GDOP/PDOP/HDOP/VDOP/TDOP (+ u-blox's NDOP/EDOP).
 *           Reported by u-blox scaled ×100.
 *   CEP   — circular error probable: the radius of the circle containing 50%
 *           of horizontal fixes. It is a STATISTIC, not a streamed field — no
 *           GNSS message contains a CEP. It is derived here from the fix's
 *           position covariance, alongside the other standard radii (DRMS,
 *           2DRMS, R95), so the panel can state accuracy in whichever
 *           convention the operator's datasheet uses.
 *   hAcc  — the receiver's OWN 1-sigma horizontal accuracy estimate (mm), from
 *           NavPVT. Independent of, and generally better than, anything
 *           derived from the covariance the driver synthesises.
 */

// --------------------------------------------------------------------------
// Field access
// --------------------------------------------------------------------------
// ublox_msgs was ported from ROS1 (camelCase: `hAcc`, `numSV`, `gnssId`) to
// ROS2 (snake_case: `h_acc`, `num_sv`, `gnss_id`), and rosbridge hands us
// whatever the installed message definition actually uses. Reading both spellings
// costs one lookup and means a driver-version difference degrades to nothing
// rather than to a panel full of NO DATA.
export function field(msg, ...names) {
  if (!msg) return undefined;
  for (const n of names) {
    if (msg[n] !== undefined && msg[n] !== null) return msg[n];
  }
  return undefined;
}

/** Read a bit range [lo, hi] inclusive out of a flags byte/word. */
export function bits(value, lo, hi = lo) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const width = hi - lo + 1;
  return (value >>> lo) & ((1 << width) - 1);
}

// --------------------------------------------------------------------------
// Scaling
// --------------------------------------------------------------------------
export const DOP_SCALE = 0.01; // NavDOP / NavPVT.pDOP are reported ×100
const MM = 1e-3;
const DEG_1E7 = 1e-7;

/** mm → m, tolerating an absent field (returns null, never 0). */
export function mmToM(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v * MM : null;
}

/** u-blox 1e-7 degrees → degrees. */
export function scaledDegrees(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v * DEG_1E7 : null;
}

// --------------------------------------------------------------------------
// Ratings
// --------------------------------------------------------------------------
// The conventional DOP rating table. Boundaries are the ones quoted in the
// GPS literature; the tones map onto the dashboard's shared signal vocabulary
// so a "poor" DOP reads the same red as any other critical state.
const DOP_BANDS = [
  { max: 1, label: 'IDEAL', tone: 'live' },
  { max: 2, label: 'EXCELLENT', tone: 'live' },
  { max: 5, label: 'GOOD', tone: 'live' },
  { max: 10, label: 'MODERATE', tone: 'warn' },
  { max: 20, label: 'FAIR', tone: 'warn' },
  { max: Infinity, label: 'POOR', tone: 'critical' },
];

export function dopQuality(dop) {
  if (typeof dop !== 'number' || !Number.isFinite(dop) || dop <= 0) {
    return { label: null, tone: 'idle' };
  }
  return DOP_BANDS.find((b) => dop < b.max) ?? DOP_BANDS[DOP_BANDS.length - 1];
}

// C/N0 bands in dB-Hz. ~25 dB-Hz is roughly where a consumer receiver stops
// being able to hold lock, ~40 is a clean open-sky signal.
const CNO_BANDS = [
  { min: 45, label: 'STRONG', tone: 'live' },
  { min: 40, label: 'GOOD', tone: 'live' },
  { min: 33, label: 'FAIR', tone: 'warn' },
  { min: 25, label: 'WEAK', tone: 'warn' },
  { min: 0, label: 'POOR', tone: 'critical' },
];

export function cnoQuality(cno) {
  if (typeof cno !== 'number' || !Number.isFinite(cno)) return { label: null, tone: 'idle' };
  return CNO_BANDS.find((b) => cno >= b.min) ?? CNO_BANDS[CNO_BANDS.length - 1];
}

// Satellite count, rated the way DOP is. The count is the other half of the
// accuracy picture: DOP describes how well-spread the satellites are, the count
// describes how many there are to spread. Four is the arithmetic minimum for a
// 3D fix (three for position, one to solve the receiver clock), so a solution
// sitting at exactly four has no redundancy — one satellite lost behind a
// building and the fix drops. Roughly seven upwards is where a consumer
// receiver stops being sensitive to losing any single one.
export const SAT_MIN_3D = 4;

const SAT_BANDS = [
  { min: 9, label: 'EXCELLENT', tone: 'live' },
  { min: 7, label: 'GOOD', tone: 'live' },
  { min: 5, label: 'FAIR', tone: 'warn' },
  { min: SAT_MIN_3D, label: 'MINIMUM', tone: 'warn' },
  { min: 1, label: 'INSUFFICIENT', tone: 'critical' },
  { min: 0, label: 'NONE', tone: 'critical' },
];

/**
 * Rate the number of satellites used in the solution. Note this is the USED
 * count, not the visible one — a satellite the receiver can see but has not
 * included contributes nothing to the fix's accuracy.
 */
export function satCountQuality(used) {
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) {
    return { label: null, tone: 'idle' };
  }
  return SAT_BANDS.find((b) => used >= b.min) ?? SAT_BANDS[SAT_BANDS.length - 1];
}

/** Signals at or above this C/N0 are counted as "strong" in the summary. */
export const CNO_STRONG = 40;
/** Full-scale for the C/N0 bar chart — u-blox reports 0–63 dB-Hz. */
export const CNO_MAX = 55;

// --------------------------------------------------------------------------
// Accuracy derived from the fix covariance
// --------------------------------------------------------------------------
// NavSatFix.position_covariance is a row-major 3×3 in m², ENU-aligned, so the
// diagonal is [σE², σN², σU²].
//
// The circular radii below all assume a circular-normal horizontal error, using
// the equivalent circular sigma σ = √((σE² + σN²)/2):
//
//   R(p) = σ·√(-2·ln(1-p))   ⇒   CEP50 = 1.1774σ,  R95 = 2.4477σ
//   DRMS = √(σE² + σN²) = σ√2   (~65%),  2DRMS = 2·DRMS   (~95–98%)
//
// These are the standard conversions; they are approximations when the error
// ellipse is strongly elongated (σN/σE far from 1), which is why the raw
// per-axis sigmas are returned too rather than only the summary radii.
export const CEP50_K = 1.1774;
export const R95_K = 2.4477;

/** NavSatFix.position_covariance_type. 0 means the driver filled in nothing. */
export const COVARIANCE_TYPE = {
  0: 'UNKNOWN',
  1: 'APPROXIMATED',
  2: 'DIAGONAL_KNOWN',
  3: 'KNOWN',
};

export function covarianceTypeLabel(type) {
  return COVARIANCE_TYPE[type] ?? null;
}

/**
 * Turn a NavSatFix covariance into the usual accuracy radii, in metres.
 * Returns null when the covariance is absent or explicitly UNKNOWN — a fix
 * with no covariance must read NO DATA, not 0.00 m.
 */
export function accuracyFromCovariance(covariance, covarianceType) {
  if (covarianceType === 0) return null;
  if (!covariance || covariance.length < 9) return null;

  const varE = Number(covariance[0]);
  const varN = Number(covariance[4]);
  const varU = Number(covariance[8]);
  if (![varE, varN].every((v) => Number.isFinite(v) && v >= 0)) return null;
  // An all-zero covariance is the driver saying "unset", not "perfect".
  if (varE === 0 && varN === 0) return null;

  const sigmaE = Math.sqrt(varE);
  const sigmaN = Math.sqrt(varN);
  const sigmaU = Number.isFinite(varU) && varU >= 0 ? Math.sqrt(varU) : null;
  const sigmaH = Math.sqrt((varE + varN) / 2);
  const drms = Math.sqrt(varE + varN);

  return {
    sigmaE,
    sigmaN,
    sigmaU,
    sigmaH,
    drms,
    twoDrms: 2 * drms,
    cep50: CEP50_K * sigmaH,
    r95: R95_K * sigmaH,
  };
}

// --------------------------------------------------------------------------
// Fix / solution vocabulary
// --------------------------------------------------------------------------
/** NavPVT.fixType and NavSTATUS.gpsFix share this enumeration. */
export const FIX_TYPE = {
  0: 'NO FIX',
  1: 'DEAD RECKONING',
  2: '2D FIX',
  3: '3D FIX',
  4: 'GNSS + DR',
  5: 'TIME ONLY',
};

export function fixTypeLabel(fixType) {
  return FIX_TYPE[fixType] ?? (fixType == null ? null : 'UNKNOWN');
}

/** NavPVT.flags bits 6–7 — the RTK carrier-phase solution state. */
export const CARRIER_SOLUTION = {
  0: 'NONE',
  1: 'RTK FLOAT',
  2: 'RTK FIXED',
};

export function carrierSolutionLabel(carrSoln) {
  return CARRIER_SOLUTION[carrSoln] ?? (carrSoln == null ? null : 'UNKNOWN');
}

/** Decode the NavPVT flags byte into the parts an operator cares about. */
export function decodePvtFlags(flags) {
  if (typeof flags !== 'number' || !Number.isFinite(flags)) {
    return { fixOk: null, diffSoln: null, carrSoln: null, headVehValid: null };
  }
  return {
    fixOk: bits(flags, 0) === 1,
    diffSoln: bits(flags, 1) === 1,
    headVehValid: bits(flags, 5) === 1,
    carrSoln: bits(flags, 6, 7),
  };
}

/**
 * NavSatFix.status.service is a constellation bitmask. Note it predates
 * BeiDou's rename — bit 2 is spelled COMPASS in sensor_msgs.
 */
const SERVICE_BITS = [
  [1, 'GPS'],
  [2, 'GLONASS'],
  [4, 'BEIDOU'],
  [8, 'GALILEO'],
];

export function serviceLabels(service) {
  if (typeof service !== 'number' || !Number.isFinite(service)) return [];
  return SERVICE_BITS.filter(([bit]) => (service & bit) !== 0).map(([, name]) => name);
}

// --------------------------------------------------------------------------
// Satellites (NavSAT)
// --------------------------------------------------------------------------
export const GNSS_IDS = {
  0: 'GPS',
  1: 'SBAS',
  2: 'GALILEO',
  3: 'BEIDOU',
  4: 'IMES',
  5: 'QZSS',
  6: 'GLONASS',
  7: 'NAVIC',
};

export function constellationName(gnssId) {
  return GNSS_IDS[gnssId] ?? 'OTHER';
}

/** NavSAT per-satellite flags word. */
export function decodeSvFlags(flags) {
  return {
    qualityInd: bits(flags, 0, 2),
    used: bits(flags, 3) === 1,
    health: bits(flags, 4, 5), // 0 unknown, 1 healthy, 2 unhealthy
    diffCorr: bits(flags, 6) === 1,
  };
}

/**
 * Normalise a NavSAT satellite list into a shape the UI can render directly,
 * plus the aggregate signal figures (mean/max C/N0, strong count) that answer
 * "is the sky good right now?" without reading every bar.
 *
 * Satellites are sorted strongest-first so the bar chart is legible and a
 * truncated view still shows the signals that matter.
 */
export function summarizeSatellites(rawSvs) {
  const list = Array.isArray(rawSvs) ? rawSvs : [];

  const satellites = list.map((sv) => {
    const gnssId = field(sv, 'gnss_id', 'gnssId');
    const cnoRaw = field(sv, 'cno');
    const cno = typeof cnoRaw === 'number' ? cnoRaw : null;
    const decoded = decodeSvFlags(field(sv, 'flags'));
    return {
      gnssId,
      constellation: constellationName(gnssId),
      svId: field(sv, 'sv_id', 'svId'),
      cno,
      elevation: field(sv, 'elev'),
      azimuth: field(sv, 'azim'),
      residual: field(sv, 'pr_res', 'prRes'),
      ...decoded,
    };
  });

  // Tracked = actually carrying signal. A satellite the receiver knows about
  // but hears nothing from would otherwise drag the mean C/N0 down.
  const tracked = satellites.filter((s) => s.cno != null && s.cno > 0);
  const used = satellites.filter((s) => s.used);
  const cnos = tracked.map((s) => s.cno);

  const byConstellation = new Map();
  for (const s of satellites) {
    const entry = byConstellation.get(s.constellation) ?? { name: s.constellation, visible: 0, used: 0 };
    entry.visible += 1;
    if (s.used) entry.used += 1;
    byConstellation.set(s.constellation, entry);
  }

  return {
    satellites: satellites.sort((a, b) => (b.cno ?? -1) - (a.cno ?? -1)),
    visible: satellites.length,
    tracked: tracked.length,
    used: used.length,
    meanCno: cnos.length ? cnos.reduce((a, b) => a + b, 0) / cnos.length : null,
    maxCno: cnos.length ? Math.max(...cnos) : null,
    strongCount: cnos.filter((c) => c >= CNO_STRONG).length,
    constellations: [...byConstellation.values()].sort((a, b) => b.used - a.used || b.visible - a.visible),
  };
}

// --------------------------------------------------------------------------
// RF front-end health (MonHW)
// --------------------------------------------------------------------------
// This is the closest thing GNSS has to the "RSSI" of a comms radio: it
// describes the receiver's RF input rather than any one satellite. A jammed or
// saturated front-end degrades every C/N0 at once, so it is the first place to
// look when the whole constellation goes quiet.
export const ANTENNA_STATUS = { 0: 'INIT', 1: 'UNKNOWN', 2: 'OK', 3: 'SHORT', 4: 'OPEN' };
export const ANTENNA_POWER = { 0: 'OFF', 1: 'ON', 2: 'UNKNOWN' };
export const JAMMING_STATE = {
  0: 'UNMONITORED',
  1: 'OK',
  2: 'WARNING',
  3: 'CRITICAL',
};

export function antennaStatusLabel(aStatus) {
  return ANTENNA_STATUS[aStatus] ?? null;
}

export function antennaStatusTone(aStatus) {
  if (aStatus === 2) return 'live';
  if (aStatus === 3 || aStatus === 4) return 'critical';
  return 'idle';
}

export function jammingStateLabel(state) {
  return JAMMING_STATE[state] ?? null;
}

export function jammingTone(state) {
  if (state === 1) return 'live';
  if (state === 2) return 'warn';
  if (state === 3) return 'critical';
  return 'idle';
}

/** AGC monitor is 0–8191 full scale; a percentage is the readable form. */
export const AGC_MAX = 8191;
export function agcPercent(agcCnt) {
  if (typeof agcCnt !== 'number' || !Number.isFinite(agcCnt)) return null;
  return Math.min(100, Math.max(0, (agcCnt / AGC_MAX) * 100));
}

/** Broadband jamming indicator is 0–255 (0 = quiet, 255 = saturated). */
export const JAM_IND_MAX = 255;
export function jamPercent(jamInd) {
  if (typeof jamInd !== 'number' || !Number.isFinite(jamInd)) return null;
  return Math.min(100, Math.max(0, (jamInd / JAM_IND_MAX) * 100));
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------
/**
 * Distance in the unit that keeps it readable: sub-metre accuracies are the
 * interesting case for RTK, and "0.02 m" hides a decimal that "2.0 cm" shows.
 */
export function formatDistance(metres) {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) return null;
  if (Math.abs(metres) < 1) return { value: (metres * 100).toFixed(1), unit: 'cm' };
  if (Math.abs(metres) < 100) return { value: metres.toFixed(2), unit: 'm' };
  return { value: metres.toFixed(0), unit: 'm' };
}

/** Fixed-precision number, or null so the caller renders NO DATA. */
export function fixed(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

/**
 * NavPVT carries its own UTC timestamp plus a validity byte; showing the time
 * without the validity would present an unsynchronised clock as authoritative.
 * NavPVT.valid bits: 0 validDate, 1 validTime, 2 fullyResolved, 3 validMag.
 */
export function pvtUtcTime(pvt) {
  const valid = field(pvt, 'valid');
  const dateOk = bits(valid, 0) === 1;
  const timeOk = bits(valid, 1) === 1;
  const resolved = bits(valid, 2) === 1;

  const hour = field(pvt, 'hour');
  const min = field(pvt, 'min');
  const sec = field(pvt, 'sec');
  if ([hour, min, sec].some((v) => typeof v !== 'number')) return null;

  const pad = (n) => String(n).padStart(2, '0');
  return {
    text: `${pad(hour)}:${pad(min)}:${pad(sec)}`,
    dateOk,
    timeOk,
    resolved,
  };
}
