/**
 * Waypoint model helpers
 * ----------------------
 * Pure functions over the mission route. No React, no ROS — the list is a
 * plain ordered array of waypoints, so ordering/validation logic stays
 * testable without mounting a map.
 *
 * Every waypoint carries a stable `id`. Reorder and delete are identity
 * operations, not index operations: keying React rows or Leaflet markers by
 * array index breaks the moment a waypoint moves up the list.
 *
 * `status` is deliberately limited to PENDING | SENT_UNCONFIRMED. There is no
 * REACHED — that would require a robot-side ack this workspace does not have
 * (docs/remediation/spec.md REQ-01), and inferring it from a client-side
 * distance check would be fabricated state.
 */

export const WAYPOINT_PENDING = 'PENDING';
export const WAYPOINT_SENT = 'SENT_UNCONFIRMED';

// Monotonic counter rather than crypto.randomUUID(): ids only need to be
// unique within one session's list, and a counter keeps tests deterministic.
let seq = 0;

export function createWaypoint({ name = '', latitude = '', longitude = '' } = {}) {
  seq += 1;
  return {
    id: `wp-${seq}`,
    name: String(name).trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    status: WAYPOINT_PENDING,
  };
}

/** Test seam so id sequences don't leak between test files. */
export function __resetWaypointIds() {
  seq = 0;
}

export function isValidLatitude(value) {
  const n = Number(value);
  return value !== '' && value !== null && Number.isFinite(n) && n >= -90 && n <= 90;
}

export function isValidLongitude(value) {
  const n = Number(value);
  return value !== '' && value !== null && Number.isFinite(n) && n >= -180 && n <= 180;
}

/**
 * Why an entry can't be added, or null if it can. Returns the *first* blocker
 * so the UI can name one specific fix rather than greying a button out
 * (spec REQ-19).
 */
export function entryError({ name, latitude, longitude }) {
  if (!String(name ?? '').trim()) return 'Enter a waypoint name';
  if (!isValidLatitude(latitude)) return 'Enter a latitude between -90 and 90';
  if (!isValidLongitude(longitude)) return 'Enter a longitude between -180 and 180';
  return null;
}

/** Why the route can't be dispatched, or null if it can. */
export function routeError(waypoints) {
  if (!waypoints?.length) return 'Add at least one waypoint';
  const bad = waypoints.findIndex(
    (wp) => !isValidLatitude(wp.latitude) || !isValidLongitude(wp.longitude),
  );
  if (bad !== -1) return `Waypoint ${bad + 1} has invalid coordinates`;
  return null;
}

/**
 * Move the waypoint with `id` by `delta` places. Out-of-range moves are a
 * no-op returning the SAME array reference, so a disabled ▲ on row 1 can't
 * trigger a pointless re-render or a marker rebuild.
 */
export function moveWaypoint(waypoints, id, delta) {
  const from = waypoints.findIndex((wp) => wp.id === id);
  if (from === -1) return waypoints;
  const to = from + delta;
  if (to < 0 || to >= waypoints.length) return waypoints;
  const next = [...waypoints];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Leaflet-shaped [lat, lng] pairs for the route polyline. */
export function toLatLngs(waypoints) {
  return waypoints
    .filter((wp) => isValidLatitude(wp.latitude) && isValidLongitude(wp.longitude))
    .map((wp) => [Number(wp.latitude), Number(wp.longitude)]);
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two [lat, lng] pairs, in metres. */
export function legDistanceMeters([lat1, lon1], [lat2, lon2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Total length of the straight legs between waypoints, in metres.
 *
 * This is the sum of great-circle hops in list order — NOT the distance the
 * robot will drive. It ignores obstacles, terrain and whatever path Nav2
 * actually plans, so anything rendering this must say "straight-line". It is
 * an ordering sanity-check for the operator ("did I queue these in a sane
 * sequence?"), not a trip estimate.
 *
 * Deliberately no ETA counterpart: an ETA needs a speed the dashboard does
 * not have, and inventing one would be exactly the fabricated telemetry the
 * rest of this app refuses to render.
 */
export function routeDistanceMeters(waypoints) {
  const pts = toLatLngs(waypoints);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += legDistanceMeters(pts[i - 1], pts[i]);
  }
  return total;
}

/** Compact human-readable distance for a dense operator panel. */
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
