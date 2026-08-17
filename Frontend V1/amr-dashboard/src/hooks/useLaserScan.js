import useRosTopic from './useRosTopic.js';

/**
 * useLaserScan
 * Subscribes to /scan (sensor_msgs/LaserScan). Returns the raw scan plus
 * derived cartesian points for rendering. No synthetic ranges are
 * produced — ranges of Infinity/NaN (per LaserScan spec, out-of-range
 * readings) are filtered out, not replaced with fake values.
 */
export default function useLaserScan() {
  const { data, hasData } = useRosTopic({
    name: '/scan',
    messageType: 'sensor_msgs/LaserScan',
    throttle_rate: 150,
  });

  if (!hasData || !data) {
    return { hasData: false, points: [], minRange: null, raw: null };
  }

  const { angle_min, angle_increment, ranges, range_min, range_max } = data;
  const points = [];
  let nearestRange = null;

  ranges.forEach((r, i) => {
    if (!Number.isFinite(r) || r < range_min || r > range_max) return;
    const angle = angle_min + i * angle_increment;
    points.push({
      angle,
      range: r,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
    });
    if (nearestRange === null || r < nearestRange) nearestRange = r;
  });

  return { hasData: true, points, minRange: nearestRange, raw: data };
}
