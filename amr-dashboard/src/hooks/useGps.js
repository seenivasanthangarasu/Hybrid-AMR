import useRosTopic from './useRosTopic.js';

/**
 * useGps
 * Subscribes to /fix (sensor_msgs/NavSatFix). Only real fix data is ever
 * returned — if the topic has no live publisher, hasData is false and
 * callers must render NO DATA instead of inventing coordinates.
 *
 * NavSatFix.status.status values: -1 = NO_FIX, 0 = FIX, 1 = SBAS_FIX, 2 = GBAS_FIX
 */
export default function useGps() {
  const { data, hasData, stale, lastReceivedAt } = useRosTopic({
    name: '/fix',
    messageType: 'sensor_msgs/NavSatFix',
    throttle_rate: 200,
  });

  // See useOdometry: last-known values are surfaced even when stale so the
  // UI can show them dimmed + aged; `hasData` stays live-only (spec REQ-17).
  const timing = { hasData, hasEverData: !!data, stale, lastReceivedAt };

  if (!data) {
    return { ...timing, latitude: null, longitude: null, altitude: null, fixStatus: null };
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
    covariance: data.position_covariance,
  };
}
