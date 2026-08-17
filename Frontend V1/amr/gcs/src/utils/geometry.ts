/** Geometry and coordinate utilities */

interface Point { x: number; y: number }

/** Euclidean distance between two 2D points (in meters) */
export function euclideanDistance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Haversine formula — distance between two GPS coordinates in meters */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000 // Earth radius in meters
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Convert degrees to radians */
export function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Convert radians to degrees */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
