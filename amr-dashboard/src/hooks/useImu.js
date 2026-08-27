import useRosTopic from './useRosTopic.js';

/**
 * useImu
 * Subscribes to:
 *   /hiwonder/imu/data_raw  — sensor_msgs/Imu  (accel, gyro, orientation)
 *   /hiwonder/imu/mag       — sensor_msgs/MagneticField
 *
 * Raw data only — no values are ever synthesised. If either topic has no
 * live publisher, hasData is false and callers render NO DATA.
 *
 * sensor_msgs/Imu field layout:
 *   orientation            { x, y, z, w }          quaternion (all 0 if unknown)
 *   angular_velocity       { x, y, z }             rad/s
 *   linear_acceleration    { x, y, z }             m/s²
 *
 * sensor_msgs/MagneticField field layout:
 *   magnetic_field         { x, y, z }             Tesla
 */
function rad2deg(r) {
  return r != null && Number.isFinite(r) ? (r * 180) / Math.PI : null;
}

function quaternionToEulerDeg(q) {
  if (!q) return { roll: null, pitch: null, yaw: null };
  const { x, y, z, w } = q;

  // Roll (x-axis)
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  // Pitch (y-axis) — clamped to avoid gimbal lock artefacts
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  // Yaw (z-axis)
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  let yaw = Math.atan2(sinyCosp, cosyCosp);
  if (yaw < 0) yaw += 2 * Math.PI;

  return {
    roll: rad2deg(roll),
    pitch: rad2deg(pitch),
    yaw: rad2deg(yaw),
  };
}

export default function useImu() {
  const imuTopic = useRosTopic({
    name: '/hiwonder/imu/data_raw',
    messageType: 'sensor_msgs/Imu',
    throttle_rate: 100,
  });

  const magTopic = useRosTopic({
    name: '/hiwonder/imu/mag',
    messageType: 'sensor_msgs/MagneticField',
    throttle_rate: 200,
  });

  const imu = imuTopic.data;
  const mag = magTopic.data;

  const imuTiming = {
    hasData: imuTopic.hasData,
    hasEverData: !!imu,
    stale: imuTopic.stale,
    lastReceivedAt: imuTopic.lastReceivedAt,
  };
  const magTiming = {
    hasData: magTopic.hasData,
    hasEverData: !!mag,
    stale: magTopic.stale,
    lastReceivedAt: magTopic.lastReceivedAt,
  };

  const orientation = imu?.orientation ?? null;
  const euler = quaternionToEulerDeg(orientation);

  const ax = imu?.linear_acceleration?.x ?? null;
  const ay = imu?.linear_acceleration?.y ?? null;
  const az = imu?.linear_acceleration?.z ?? null;

  const gx = imu?.angular_velocity?.x ?? null;
  const gy = imu?.angular_velocity?.y ?? null;
  const gz = imu?.angular_velocity?.z ?? null;

  const mx = mag?.magnetic_field?.x ?? null;
  const my = mag?.magnetic_field?.y ?? null;
  const mz = mag?.magnetic_field?.z ?? null;

  // Magnitude helpers — null if any component is missing
  const accelMag =
    ax != null && ay != null && az != null ? Math.sqrt(ax * ax + ay * ay + az * az) : null;
  const gyroMag =
    gx != null && gy != null && gz != null ? Math.sqrt(gx * gx + gy * gy + gz * gz) : null;
  const magMag =
    mx != null && my != null && mz != null ? Math.sqrt(mx * mx + my * my + mz * mz) : null;

  return {
    timing: { imu: imuTiming, mag: magTiming },

    // Derived Euler angles (degrees) from orientation quaternion
    roll: euler.roll,
    pitch: euler.pitch,
    yaw: euler.yaw,

    // Raw quaternion
    orientation: imu
      ? {
          x: orientation?.x ?? null,
          y: orientation?.y ?? null,
          z: orientation?.z ?? null,
          w: orientation?.w ?? null,
        }
      : null,

    // Linear acceleration (m/s²)
    accel: { x: ax, y: ay, z: az, magnitude: accelMag },

    // Angular velocity (rad/s → displayed as deg/s in the panel)
    gyro: {
      x: gx != null ? rad2deg(gx) : null,
      y: gy != null ? rad2deg(gy) : null,
      z: gz != null ? rad2deg(gz) : null,
      magnitude: gyroMag != null ? rad2deg(gyroMag) : null,
    },

    // Magnetometer (µT — Tesla × 1e6)
    mag: {
      x: mx != null ? mx * 1e6 : null,
      y: my != null ? my * 1e6 : null,
      z: mz != null ? mz * 1e6 : null,
      magnitude: magMag != null ? magMag * 1e6 : null,
    },

    topics: {
      imu: '/hiwonder/imu/data_raw',
      mag: '/hiwonder/imu/mag',
    },
  };
}
