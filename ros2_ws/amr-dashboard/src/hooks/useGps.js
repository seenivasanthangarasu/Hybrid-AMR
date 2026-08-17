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
  const { data, hasData } = useRosTopic({
    name: '/fix',
    messageType: 'sensor_msgs/NavSatFix',
    throttle_rate: 200,
  });

  if (!hasData || !data) {
    return { hasData: false, latitude: null, longitude: null, altitude: null, fixStatus: null };
  }

  const fixStatusCode = data.status?.status;
  const fixLabels = { '-1': 'NO_FIX', 0: 'FIX', 1: 'SBAS_FIX', 2: 'GBAS_FIX' };

  return {
    hasData: true,
    latitude: data.latitude,
    longitude: data.longitude,
    altitude: data.altitude,
    fixStatusCode,
    fixStatus: fixLabels[fixStatusCode] ?? 'UNKNOWN',
    covariance: data.position_covariance,
  };
}
