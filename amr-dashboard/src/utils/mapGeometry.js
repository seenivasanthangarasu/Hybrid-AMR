/**
 * mapGeometry.js
 * Rigorous 2D occupancy grid coordinate transformations between screen/canvas pixels
 * and ROS map-frame meters, including origin translation, nonzero origin yaw rotation,
 * resolution scaling, and image Y-flip.
 */

/**
 * Extracts planar yaw (radians) from a quaternion { x, y, z, w }
 */
export function getYawFromQuaternion(q) {
  if (!q) return 0;
  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny_cosp, cosy_cosp);
}

/**
 * Creates a quaternion { x: 0, y: 0, z, w } from planar yaw (radians)
 */
export function getQuaternionFromYaw(yaw) {
  const half = (yaw || 0) / 2;
  return {
    x: 0,
    y: 0,
    z: Math.sin(half),
    w: Math.cos(half),
  };
}

/**
 * Normalizes an angle into [-PI, PI] range
 */
export function normalizeAngle(rad) {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Converts screen/canvas pixel coordinates (sx, sy) into map frame meters (wx, wy).
 *
 * Parameters:
 * - sx, sy: canvas pixel position relative to map render area
 * - width, height: grid dimensions (cells)
 * - resolution: meters per cell (> 0)
 * - origin: { position: { x, y }, orientation: { x, y, z, w } }
 * - scale: canvas rendering scale factor (e.g. min(canvasW / width, canvasH / height))
 * - offX, offY: canvas rendering offsets
 */
export function screenToWorld({
  sx,
  sy,
  width,
  height,
  resolution,
  origin,
  scale = 1,
  offX = 0,
  offY = 0,
}) {
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('Invalid grid resolution');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Invalid grid dimensions');
  }

  const canvasPx = (sx - offX) / scale;
  const canvasPy = (sy - offY) / scale;

  const isInside = canvasPx >= 0 && canvasPx < width && canvasPy >= 0 && canvasPy < height;

  // Grid coordinates in meters relative to grid bottom-left origin:
  // ROS grid row 0 is bottom, canvas row 0 is top (Y-flip applied):
  const gx = canvasPx * resolution;
  const gy = (height - canvasPy) * resolution;

  const originX = origin?.position?.x ?? 0;
  const originY = origin?.position?.y ?? 0;
  const originYaw = getYawFromQuaternion(origin?.orientation);

  const cosY = Math.cos(originYaw);
  const sinY = Math.sin(originYaw);

  // Rotate by origin yaw and translate by origin position:
  const wx = originX + gx * cosY - gy * sinY;
  const wy = originY + gx * sinY + gy * cosY;

  const col = Math.floor(canvasPx);
  const row = height - 1 - Math.floor(canvasPy);

  return {
    wx,
    wy,
    canvasPx,
    canvasPy,
    col,
    row,
    isInside,
  };
}

/**
 * Converts world map-frame meters (wx, wy) into screen/canvas pixel coordinates (sx, sy).
 */
export function worldToScreen({
  wx,
  wy,
  width,
  height,
  resolution,
  origin,
  scale = 1,
  offX = 0,
  offY = 0,
}) {
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('Invalid grid resolution');
  }

  const originX = origin?.position?.x ?? 0;
  const originY = origin?.position?.y ?? 0;
  const originYaw = getYawFromQuaternion(origin?.orientation);

  const dx = wx - originX;
  const dy = wy - originY;

  // Inverse rotation:
  const cosY = Math.cos(originYaw);
  const sinY = Math.sin(originYaw);

  const gx = dx * cosY + dy * sinY;
  const gy = -dx * sinY + dy * cosY;

  const canvasPx = gx / resolution;
  const canvasPy = height - gy / resolution;

  const sx = offX + canvasPx * scale;
  const sy = offY + canvasPy * scale;

  const isInside = canvasPx >= 0 && canvasPx < width && canvasPy >= 0 && canvasPy < height;

  return {
    sx,
    sy,
    canvasPx,
    canvasPy,
    isInside,
  };
}

/**
 * Inspects occupancy grid cell at given (col, row).
 * Returns: { value, type: 'free' | 'occupied' | 'unknown' | 'out_of_bounds' }
 */
export function getCellOccupancy(col, row, width, height, data) {
  if (col < 0 || col >= width || row < 0 || row >= height) {
    return { value: null, type: 'out_of_bounds' };
  }
  if (!data || data.length < width * height) {
    return { value: null, type: 'unknown' };
  }

  const idx = row * width + col;
  const val = data[idx];

  if (val === -1) {
    return { value: val, type: 'unknown' };
  }
  if (val >= 50) {
    return { value: val, type: 'occupied' };
  }
  return { value: val, type: 'free' };
}
