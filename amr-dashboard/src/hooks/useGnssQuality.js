import useRosTopic from './useRosTopic.js';
import useGps from './useGps.js';
import {
  DOP_SCALE,
  accuracyFromCovariance,
  agcPercent,
  antennaStatusLabel,
  antennaStatusTone,
  bits,
  carrierSolutionLabel,
  covarianceTypeLabel,
  decodePvtFlags,
  field,
  fixTypeLabel,
  jamPercent,
  jammingStateLabel,
  jammingTone,
  mmToM,
  pvtUtcTime,
  serviceLabels,
  summarizeSatellites,
} from '../utils/gnss.js';

/**
 * useGnssQuality
 *
 * Everything about the fix that isn't the fix itself: dilution of precision,
 * per-satellite C/N0, estimated accuracy, RTK solution state and RF front-end
 * health. /fix (NavSatFix) carries none of this, so the detail comes from the
 * u-blox driver's own messages.
 *
 * Each source is subscribed and reported INDEPENDENTLY. The driver publishes
 * these only when the matching `publish.nav.*` / `publish.mon.*` option is
 * enabled in ublox_config.yaml, so a deployment with DOP off but satellites on
 * must show real satellite data next to an honest NO DATA for DOP — never a
 * blank panel, and never a synthesised zero (the project-wide rule enforced by
 * useRosTopic).
 *
 * Topics are relative to the node's namespace, which is root for
 * `ros2 run ublox_gps ublox_gps_node` — the same reason /fix is unprefixed.
 * VITE_UBLOX_NS covers a deployment that launches the driver inside a
 * namespace (e.g. "/ublox").
 * NOTE: the GPS fix itself comes from /hiwonder/gps/fix (see useGps.js).
 */
const NS = (import.meta.env?.VITE_UBLOX_NS || '').replace(/\/$/, '');
const topic = (name) => `${NS}${name}`;

// The receiver emits these at the navigation rate (typically 1–10 Hz). They are
// slower-moving diagnostics than the fix itself, so they are throttled harder
// than /fix's 200 ms: nothing here needs to update faster than the eye reads it.
const NAV_THROTTLE = 500;
// Hardware monitoring changes on the timescale of the RF environment, not the
// solution. Once a second is plenty and keeps the bridge quiet.
const MON_THROTTLE = 1000;
// MonHW arrives roughly at 1 Hz; the default 4 s window would flap it to STALE
// on a single dropped message.
const MON_STALE_MS = 8000;

/** Freshness triple for one sub-source, in the shape classifyFreshness wants. */
function timingOf({ data, hasData, stale, lastReceivedAt }) {
  return { hasData, hasEverData: !!data, stale, lastReceivedAt };
}

export default function useGnssQuality() {
  const gps = useGps();

  const pvtTopic = useRosTopic({
    name: topic('/navpvt'),
    messageType: 'ublox_msgs/NavPVT',
    throttle_rate: NAV_THROTTLE,
  });
  const dopTopic = useRosTopic({
    name: topic('/navdop'),
    messageType: 'ublox_msgs/NavDOP',
    throttle_rate: NAV_THROTTLE,
  });
  const satTopic = useRosTopic({
    name: topic('/navsat'),
    messageType: 'ublox_msgs/NavSAT',
    throttle_rate: NAV_THROTTLE,
  });
  const statusTopic = useRosTopic({
    name: topic('/navstatus'),
    messageType: 'ublox_msgs/NavSTATUS',
    throttle_rate: NAV_THROTTLE,
  });
  const hwTopic = useRosTopic({
    name: topic('/monhw'),
    messageType: 'ublox_msgs/MonHW',
    throttle_rate: MON_THROTTLE,
    staleMs: MON_STALE_MS,
  });

  const pvt = pvtTopic.data;
  const dopMsg = dopTopic.data;
  const satMsg = satTopic.data;
  const statusMsg = statusTopic.data;
  const hwMsg = hwTopic.data;

  // ---- Dilution of precision ---------------------------------------------
  // NavDOP is the full family; NavPVT carries pDOP only. Both are ×100.
  const scaleDop = (v) => (typeof v === 'number' && Number.isFinite(v) ? v * DOP_SCALE : null);
  const dop = dopMsg
    ? {
        gdop: scaleDop(field(dopMsg, 'g_dop', 'gDOP')),
        pdop: scaleDop(field(dopMsg, 'p_dop', 'pDOP')),
        tdop: scaleDop(field(dopMsg, 't_dop', 'tDOP')),
        vdop: scaleDop(field(dopMsg, 'v_dop', 'vDOP')),
        hdop: scaleDop(field(dopMsg, 'h_dop', 'hDOP')),
        ndop: scaleDop(field(dopMsg, 'n_dop', 'nDOP')),
        edop: scaleDop(field(dopMsg, 'e_dop', 'eDOP')),
      }
    : null;

  // PDOP is the one DOP available from two sources. Prefer NavDOP (it is the
  // dedicated message) and fall back to NavPVT so a receiver configured with
  // only PVT enabled still shows a geometry figure.
  const pvtPdop = scaleDop(field(pvt, 'p_dop', 'pDOP'));
  const pdop = dop?.pdop ?? pvtPdop;
  const pdopSource = dop?.pdop != null ? '/navdop' : pvtPdop != null ? '/navpvt' : null;

  // ---- Receiver-estimated accuracy ---------------------------------------
  const estimated = pvt
    ? {
        horizontal: mmToM(field(pvt, 'h_acc', 'hAcc')),
        vertical: mmToM(field(pvt, 'v_acc', 'vAcc')),
        speed: mmToM(field(pvt, 's_acc', 'sAcc')), // mm/s → m/s, same scale
        // headAcc is 1e-5 deg.
        heading: (() => {
          const v = field(pvt, 'head_acc', 'headAcc');
          return typeof v === 'number' && Number.isFinite(v) ? v * 1e-5 : null;
        })(),
        // tAcc is ns.
        time: (() => {
          const v = field(pvt, 't_acc', 'tAcc');
          return typeof v === 'number' && Number.isFinite(v) ? v * 1e-9 : null;
        })(),
      }
    : null;

  // ---- Accuracy derived from the fix covariance --------------------------
  // Always available when /fix is (the driver fills the covariance from its own
  // accuracy estimates), so CEP/R95/DRMS survive even with every ublox_msgs
  // topic disabled.
  const derived = accuracyFromCovariance(gps.covariance, gps.covarianceType);

  // ---- Solution state ----------------------------------------------------
  const pvtFlags = decodePvtFlags(field(pvt, 'flags'));
  const fixTypeCode = field(pvt, 'fix_type', 'fixType');
  const numSvUsed = field(pvt, 'num_sv', 'numSV');

  const solution = pvt
    ? {
        fixTypeCode,
        fixType: fixTypeLabel(fixTypeCode),
        fixOk: pvtFlags.fixOk,
        differential: pvtFlags.diffSoln,
        carrierSolutionCode: pvtFlags.carrSoln,
        carrierSolution: carrierSolutionLabel(pvtFlags.carrSoln),
        satellitesUsed: typeof numSvUsed === 'number' ? numSvUsed : null,
        groundSpeed: mmToM(field(pvt, 'g_speed', 'gSpeed')),
        // Ellipsoid height vs mean sea level; their difference is the local
        // geoid separation, which explains an altitude that looks "wrong".
        heightEllipsoid: mmToM(field(pvt, 'height')),
        heightMsl: mmToM(field(pvt, 'h_msl', 'hMSL')),
        utc: pvtUtcTime(pvt),
      }
    : null;

  if (solution && solution.heightEllipsoid != null && solution.heightMsl != null) {
    solution.geoidSeparation = solution.heightEllipsoid - solution.heightMsl;
  }

  // ---- Receiver status ---------------------------------------------------
  const statusFlags = field(statusMsg, 'flags');
  const gpsFixCode = field(statusMsg, 'gps_fix', 'gpsFix');
  const ttffMs = field(statusMsg, 'ttff');
  const upTimeMs = field(statusMsg, 'msss');

  const receiver = statusMsg
    ? {
        gpsFixCode,
        gpsFix: fixTypeLabel(gpsFixCode),
        fixOk: bits(statusFlags, 0) === 1,
        differential: bits(statusFlags, 1) === 1,
        // Time to first fix — how long this receiver took to acquire. A long
        // TTFF after a restart points at antenna/sky problems, not software.
        ttffSec: typeof ttffMs === 'number' ? ttffMs / 1000 : null,
        upTimeSec: typeof upTimeMs === 'number' ? upTimeMs / 1000 : null,
      }
    : null;

  // ---- RF front-end ------------------------------------------------------
  const hwFlags = field(hwMsg, 'flags');
  const jammingState = bits(hwFlags, 2, 3);
  const aStatus = field(hwMsg, 'a_status', 'aStatus');
  const jamInd = field(hwMsg, 'jam_ind', 'jamInd');
  const agcCnt = field(hwMsg, 'agc_cnt', 'agcCnt');

  const rf = hwMsg
    ? {
        jammingStateCode: jammingState,
        jammingState: jammingStateLabel(jammingState),
        jammingTone: jammingTone(jammingState),
        jamIndicator: typeof jamInd === 'number' ? jamInd : null,
        jamPercent: jamPercent(jamInd),
        agcCount: typeof agcCnt === 'number' ? agcCnt : null,
        agcPercent: agcPercent(agcCnt),
        noisePerMs: field(hwMsg, 'noise_per_ms', 'noisePerMS') ?? null,
        antennaStatusCode: aStatus,
        antennaStatus: antennaStatusLabel(aStatus),
        antennaTone: antennaStatusTone(aStatus),
        antennaPowerCode: field(hwMsg, 'a_power', 'aPower'),
      }
    : null;

  // ---- Satellites --------------------------------------------------------
  const sats = satMsg ? summarizeSatellites(field(satMsg, 'sv', 'svs')) : null;

  return {
    // The fix itself, so a consumer needs one hook rather than two.
    fix: {
      ...gps,
      constellations: serviceLabels(gps.service),
      covarianceTypeLabel: covarianceTypeLabel(gps.covarianceType),
    },
    dop,
    pdop,
    pdopSource,
    estimated,
    derived,
    solution,
    receiver,
    rf,
    sats,
    // Per-source freshness so every block can label itself LIVE / STALE / NO DATA
    // independently of the others.
    timing: {
      fix: { hasData: gps.hasData, hasEverData: gps.hasEverData, stale: gps.stale, lastReceivedAt: gps.lastReceivedAt },
      pvt: timingOf(pvtTopic),
      dop: timingOf(dopTopic),
      sat: timingOf(satTopic),
      status: timingOf(statusTopic),
      hw: timingOf(hwTopic),
    },
    topics: {
      fix: '/hiwonder/gps/fix',
      pvt: topic('/navpvt'),
      dop: topic('/navdop'),
      sat: topic('/navsat'),
      status: topic('/navstatus'),
      hw: topic('/monhw'),
    },
  };
}
