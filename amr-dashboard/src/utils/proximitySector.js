/**
 * Proximity Sector and Alarm Classification Utility
 * Standardized across the AMR dashboard (ROS REP-103 coordinates).
 */

export const CRITICAL_PROXIMITY_M = 0.50; // Under 50cm is an immediate collision hazard
export const WARNING_PROXIMITY_M = 1.20;  // Under 1.2m is a close caution zone

/**
 * Normalizes an angle in radians to [-PI, PI].
 */
export function normalizeAngle(rad) {
  if (!Number.isFinite(rad)) return 0;
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Classifies an angle (radians, REP-103: 0 forward, +CCW left) into an 8-point compass sector.
 *
 * @param {number} rad Angle in radians
 * @returns {string} Sector name: FRONT, FRONT-LEFT, LEFT, REAR-LEFT, REAR, REAR-RIGHT, RIGHT, FRONT-RIGHT
 */
export function getProximitySector(rad) {
  const a = normalizeAngle(rad);
  const oct = Math.PI / 8; // 22.5 degrees

  if (a >= -oct && a <= oct) {
    return 'FRONT';
  }
  if (a > oct && a <= 3 * oct) {
    return 'FRONT-LEFT';
  }
  if (a > 3 * oct && a <= 5 * oct) {
    return 'LEFT';
  }
  if (a > 5 * oct && a <= 7 * oct) {
    return 'REAR-LEFT';
  }
  if (a < -oct && a >= -3 * oct) {
    return 'FRONT-RIGHT';
  }
  if (a < -3 * oct && a >= -5 * oct) {
    return 'RIGHT';
  }
  if (a < -5 * oct && a >= -7 * oct) {
    return 'REAR-RIGHT';
  }
  return 'REAR';
}

/**
 * Classifies a distance into a threat level.
 *
 * @param {number|null} minRange Minimum detected obstacle distance in meters
 * @param {number} criticalDist Custom critical distance threshold (default: 0.5m)
 * @param {number} warningDist Custom warning distance threshold (default: 1.2m)
 * @returns {'CRITICAL' | 'WARNING' | 'CLEAR' | 'NO_DATA'} Threat status
 */
export function classifyProximity(minRange, criticalDist = CRITICAL_PROXIMITY_M, warningDist = WARNING_PROXIMITY_M) {
  if (minRange === null || minRange === undefined || !Number.isFinite(minRange)) {
    return 'NO_DATA';
  }
  if (minRange <= criticalDist) {
    return 'CRITICAL';
  }
  if (minRange <= warningDist) {
    return 'WARNING';
  }
  return 'CLEAR';
}
