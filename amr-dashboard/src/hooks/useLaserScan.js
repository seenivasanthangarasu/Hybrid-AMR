import useRosTopic from './useRosTopic.js';
import { getProximitySector, classifyProximity } from '../utils/proximitySector.js';

/**
 * useLaserScan
 * Subscribes to /scan (sensor_msgs/LaserScan). Returns the raw scan plus
 * derived cartesian points for rendering. No synthetic ranges are
 * produced — ranges of Infinity/NaN (per LaserScan spec, out-of-range
 * readings) are filtered out, not replaced with fake values.
 */
export default function useLaserScan() {
  const { data, hasData, stale, lastReceivedAt } = useRosTopic({
    name: '/scan',
    messageType: 'sensor_msgs/LaserScan',
    throttle_rate: 150,
  });

  // Freshness signals mirrored from useOdometry/useGps (spec REQ-21) so the
  // sensor views can show LIVE/STALE/NO-DATA instead of a hasData-only "LIVE".
  const timing = { hasData, hasEverData: !!data, stale, lastReceivedAt };

  if (!hasData || !data || !Array.isArray(data.ranges)) {
    return {
      ...timing,
      hasData: false,
      points: [],
      minRange: null,
      nearestPoint: null,
      proximityStatus: 'NO_DATA',
      raw: null,
    };
  }

  const { angle_min, angle_increment, ranges, range_min, range_max } = data;
  const points = [];
  let nearestRange = null;
  let nearestPoint = null;

  ranges.forEach((r, i) => {
    if (!Number.isFinite(r) || r < range_min || r > range_max) return;
    const angle = angle_min + i * angle_increment;
    const pt = {
      angle,
      range: r,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      sector: getProximitySector(angle),
    };
    points.push(pt);
    if (nearestRange === null || r < nearestRange) {
      nearestRange = r;
      nearestPoint = pt;
    }
  });

  const proximityStatus = classifyProximity(nearestRange);

  return {
    ...timing,
    hasData: true,
    points,
    minRange: nearestRange,
    nearestPoint,
    proximityStatus,
    raw: data,
  };
}
