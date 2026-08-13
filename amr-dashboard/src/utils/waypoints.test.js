import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWaypoint,
  entryError,
  formatDistance,
  isValidLatitude,
  isValidLongitude,
  legDistanceMeters,
  moveWaypoint,
  routeDistanceMeters,
  routeError,
  toLatLngs,
  WAYPOINT_PENDING,
  __resetWaypointIds,
} from './waypoints.js';

beforeEach(() => __resetWaypointIds());

describe('createWaypoint', () => {
  it('assigns a unique id and coerces coordinates to numbers', () => {
    const a = createWaypoint({ name: 'Dock A', latitude: '12.9716', longitude: '77.5946' });
    const b = createWaypoint({ name: 'Dock B', latitude: '1', longitude: '2' });

    expect(a.id).not.toBe(b.id);
    expect(a.latitude).toBe(12.9716);
    expect(typeof a.longitude).toBe('number');
  });

  it('trims the name and starts every waypoint PENDING', () => {
    const wp = createWaypoint({ name: '  Dock A  ', latitude: 1, longitude: 2 });
    expect(wp.name).toBe('Dock A');
    // Nothing may start life as sent — the status only advances when the
    // dashboard actually puts the route on the wire.
    expect(wp.status).toBe(WAYPOINT_PENDING);
  });
});

describe('coordinate validation', () => {
  it.each([0, -90, 90, '12.9716'])('accepts %s as a latitude', (v) => {
    expect(isValidLatitude(v)).toBe(true);
  });

  // An empty string coerces to 0 via Number() — a blank field must never be
  // read as "the equator", which is a real position the robot would drive to.
  it.each(['', null, 'abc', 91, -91, NaN, Infinity])('rejects %s as a latitude', (v) => {
    expect(isValidLatitude(v)).toBe(false);
  });

  it.each([0, -180, 180, '77.5946'])('accepts %s as a longitude', (v) => {
    expect(isValidLongitude(v)).toBe(true);
  });

  it.each(['', null, 'abc', 181, -181])('rejects %s as a longitude', (v) => {
    expect(isValidLongitude(v)).toBe(false);
  });
});

describe('entryError', () => {
  it('returns null when the entry is complete and valid', () => {
    expect(entryError({ name: 'Dock A', latitude: '1', longitude: '2' })).toBeNull();
  });

  it('names the first specific blocker rather than a generic failure', () => {
    expect(entryError({ name: '  ', latitude: '1', longitude: '2' })).toMatch(/name/i);
    expect(entryError({ name: 'A', latitude: '', longitude: '2' })).toMatch(/latitude/i);
    expect(entryError({ name: 'A', latitude: '1', longitude: '999' })).toMatch(/longitude/i);
  });
});

describe('routeError', () => {
  it('blocks an empty route', () => {
    expect(routeError([])).toMatch(/at least one/i);
    expect(routeError(undefined)).toMatch(/at least one/i);
  });

  it('identifies the offending waypoint by its 1-based position', () => {
    const list = [
      createWaypoint({ name: 'A', latitude: 1, longitude: 2 }),
      createWaypoint({ name: 'B', latitude: 3, longitude: 4 }),
      { id: 'x', name: 'C', latitude: NaN, longitude: 4 },
    ];
    expect(routeError(list)).toBe('Waypoint 3 has invalid coordinates');
  });

  it('passes a fully valid route', () => {
    expect(routeError([createWaypoint({ name: 'A', latitude: 1, longitude: 2 })])).toBeNull();
  });
});

describe('moveWaypoint', () => {
  const build = () =>
    ['A', 'B', 'C'].map((name, i) => createWaypoint({ name, latitude: i, longitude: i }));

  it('moves a waypoint later in the route', () => {
    const list = build();
    const moved = moveWaypoint(list, list[0].id, 1);
    expect(moved.map((w) => w.name)).toEqual(['B', 'A', 'C']);
  });

  it('moves a waypoint earlier in the route', () => {
    const list = build();
    const moved = moveWaypoint(list, list[2].id, -1);
    expect(moved.map((w) => w.name)).toEqual(['A', 'C', 'B']);
  });

  it('does not mutate the original list', () => {
    const list = build();
    moveWaypoint(list, list[0].id, 1);
    expect(list.map((w) => w.name)).toEqual(['A', 'B', 'C']);
  });

  // Same reference, not just equal contents: a no-op move must not trigger a
  // re-render that rebuilds every Leaflet marker.
  it('returns the identical array for an out-of-range or unknown move', () => {
    const list = build();
    expect(moveWaypoint(list, list[0].id, -1)).toBe(list);
    expect(moveWaypoint(list, list[2].id, 1)).toBe(list);
    expect(moveWaypoint(list, 'nope', 1)).toBe(list);
  });

  it('reorders by identity, not by index', () => {
    const list = build();
    const reordered = moveWaypoint(list, list[1].id, -1);
    // B kept its id through the move, so its marker/row is reused rather than
    // being torn down and rebuilt as a different waypoint.
    expect(reordered[0].id).toBe(list[1].id);
  });
});

describe('toLatLngs', () => {
  it('maps to Leaflet pairs in list order', () => {
    const list = [
      createWaypoint({ name: 'A', latitude: '1.5', longitude: '2.5' }),
      createWaypoint({ name: 'B', latitude: '3.5', longitude: '4.5' }),
    ];
    expect(toLatLngs(list)).toEqual([
      [1.5, 2.5],
      [3.5, 4.5],
    ]);
  });

  it('skips waypoints with unusable coordinates instead of emitting NaN pairs', () => {
    const list = [
      createWaypoint({ name: 'A', latitude: 1, longitude: 2 }),
      { id: 'bad', name: 'B', latitude: '', longitude: '' },
    ];
    expect(toLatLngs(list)).toEqual([[1, 2]]);
  });
});

describe('route distance', () => {
  // One degree of latitude is ~111.2 km anywhere on the globe.
  it('measures a single leg against a known great-circle distance', () => {
    expect(legDistanceMeters([0, 0], [1, 0]) / 1000).toBeCloseTo(111.2, 0);
  });

  it('is symmetric and zero for a degenerate leg', () => {
    expect(legDistanceMeters([12.97, 77.59], [12.97, 77.59])).toBe(0);
    expect(legDistanceMeters([0, 0], [0, 10])).toBeCloseTo(legDistanceMeters([0, 10], [0, 0]), 6);
  });

  it('sums the legs in list order', () => {
    const list = [
      createWaypoint({ name: 'A', latitude: 0, longitude: 0 }),
      createWaypoint({ name: 'B', latitude: 1, longitude: 0 }),
      createWaypoint({ name: 'C', latitude: 2, longitude: 0 }),
    ];
    const twoLegs = routeDistanceMeters(list);
    expect(twoLegs / 1000).toBeCloseTo(222.4, 0);
  });

  it('is zero for an empty or single-waypoint route', () => {
    expect(routeDistanceMeters([])).toBe(0);
    expect(routeDistanceMeters([createWaypoint({ name: 'A', latitude: 1, longitude: 1 })])).toBe(0);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, null],
    [-5, null],
    [NaN, null],
    [340, '340 m'],
    [999, '999 m'],
    [1500, '1.5 km'],
    [111200, '111 km'],
  ])('formats %s as %s', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});
