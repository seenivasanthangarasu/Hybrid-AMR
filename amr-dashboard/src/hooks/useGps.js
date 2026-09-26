import useRosTopic from './useRosTopic.js';

/**
 * useGps
 * Subscribes to /hiwonder/gps/fix (sensor_msgs/NavSatFix). Only real fix
 * data is ever returned — if the topic has no live publisher, hasData is
 * false and callers must render NO DATA instead of inventing coordinates.
 *
 * NavSatFix.status.status values: -1 = NO_FIX, 0 = FIX, 1 = SBAS_FIX, 2 = GBAS_FIX
 */
export default function useGps({ enabled = true } = {}) {
  const { data, hasData, stale, lastReceivedAt } = useRosTopic({
    name: '/hiwonder/gps/fix',
    messageType: 'sensor_msgs/NavSatFix',
    throttle_rate: 200,
    enabled,
  });

  // See useOdometry: last-known values are surfaced even when stale so the
  // UI can show them dimmed + aged; `hasData` stays live-only (spec REQ-17).
  const timing = { hasData, hasEverData: !!data, stale, lastReceivedAt };

  if (!data) {
    return {
      ...timing,
      latitude: null,
      longitude: null,
      altitude: null,
      fixStatus: null,
      service: null,
      covariance: null,
      covarianceType: null,
    };
  }

  const fixStatusCode = data.status?.status;
  const fixLabels = { '-1': 'NO_FIX', 0: 'FIX', 1: 'SBAS_FIX', 2: 'GBAS_FIX' };

  return {
    ...timing,
    latitude: data.latitude,
    longitude: data.longitude,
    altitude: data.altitude,
    fixStatusCode,
    fixStatus: fixLabels[fixStatusCode] ?? 'UNKNOWN',
    // Constellation bitmask (GPS/GLONASS/BeiDou/Galileo) — decoded by
    // utils/gnss.serviceLabels for display.
    service: data.status?.service ?? null,
    covariance: data.position_covariance,
    // position_covariance_type: 0 = UNKNOWN means the driver filled in nothing,
    // so derived accuracy (CEP/R95/DRMS) must read NO DATA rather than 0.
    covarianceType: data.position_covariance_type ?? null,
  };
}
