import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MissionProvider, useMission, useMapApi } from './MissionContext.jsx';
import { WAYPOINT_PENDING, WAYPOINT_SENT, __resetWaypointIds } from '../utils/waypoints.js';

const wrapper = ({ children }) => <MissionProvider>{children}</MissionProvider>;

const render = () => renderHook(() => useMission(), { wrapper });

beforeEach(() => __resetWaypointIds());

describe('MissionContext route state', () => {
  // An empty route, not a seeded one — nothing can be dispatched that the
  // operator did not place.
  it('starts with an empty route, no selection and a zeroed routeInfo', () => {
    const { result } = render();
    expect(result.current.waypoints).toEqual([]);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.routeInfo).toEqual({ distance: 0, eta: 0 });
  });

  it('appends waypoints in the order they are added', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: '1', longitude: '2' });
    });
    act(() => {
      result.current.addWaypoint({ name: 'B', latitude: '3', longitude: '4' });
    });

    expect(result.current.waypoints.map((w) => w.name)).toEqual(['A', 'B']);
    expect(result.current.waypoints[0].status).toBe(WAYPOINT_PENDING);
  });

  it('selects the waypoint it just added', () => {
    const { result } = render();
    let added;
    act(() => {
      added = result.current.addWaypoint({ name: 'A', latitude: '1', longitude: '2' });
    });
    expect(result.current.selectedId).toBe(added.id);
  });

  it('updates a waypoint by id without touching its neighbours', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 2 });
      result.current.addWaypoint({ name: 'B', latitude: 3, longitude: 4 });
    });
    const target = result.current.waypoints[0];
    act(() => {
      result.current.updateWaypoint(target.id, { latitude: 9.5, longitude: 8.5 });
    });

    expect(result.current.waypoints[0]).toMatchObject({ name: 'A', latitude: 9.5, longitude: 8.5 });
    expect(result.current.waypoints[1]).toMatchObject({ latitude: 3, longitude: 4 });
  });

  it('removes a waypoint by id', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 2 });
      result.current.addWaypoint({ name: 'B', latitude: 3, longitude: 4 });
    });
    act(() => {
      result.current.removeWaypoint(result.current.waypoints[0].id);
    });
    expect(result.current.waypoints.map((w) => w.name)).toEqual(['B']);
  });

  // A dangling selectedId would leave the planner highlighting a row that no
  // longer exists and the map hunting for a deleted marker.
  it('clears the selection when the selected waypoint is removed', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 2 });
    });
    const id = result.current.waypoints[0].id;
    act(() => {
      result.current.removeWaypoint(id);
    });
    expect(result.current.selectedId).toBeNull();
  });

  it('keeps the selection when a different waypoint is removed', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 2 });
      result.current.addWaypoint({ name: 'B', latitude: 3, longitude: 4 });
    });
    const keep = result.current.selectedId; // B, the most recent add
    act(() => {
      result.current.removeWaypoint(result.current.waypoints[0].id);
    });
    expect(result.current.selectedId).toBe(keep);
  });

  it('reorders the route', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
      result.current.addWaypoint({ name: 'B', latitude: 2, longitude: 2 });
    });
    act(() => {
      result.current.moveWaypoint(result.current.waypoints[1].id, -1);
    });
    expect(result.current.waypoints.map((w) => w.name)).toEqual(['B', 'A']);
  });

  it('clears the whole route and the selection', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
      result.current.addWaypoint({ name: 'B', latitude: 2, longitude: 2 });
    });
    act(() => {
      result.current.clearWaypoints();
    });
    expect(result.current.waypoints).toEqual([]);
    expect(result.current.selectedId).toBeNull();
  });
});

describe('MissionContext dispatch bookkeeping', () => {
  it('marks pending waypoints SENT_UNCONFIRMED after a dispatch', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
      result.current.addWaypoint({ name: 'B', latitude: 2, longitude: 2 });
    });
    act(() => {
      result.current.markRouteSent();
    });
    expect(result.current.waypoints.map((w) => w.status)).toEqual([
      WAYPOINT_SENT,
      WAYPOINT_SENT,
    ]);
  });

  // No robot-side ack exists for the route (spec REQ-01), so nothing in this
  // context may ever advance a waypoint past "we put it on the wire".
  it('never produces a status implying the robot arrived', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
    });
    act(() => {
      result.current.markRouteSent();
      result.current.markRouteSent();
    });
    const statuses = result.current.waypoints.map((w) => w.status);
    expect(statuses).not.toContain('REACHED');
    expect(statuses).not.toContain('CONFIRMED');
    expect(statuses).toEqual([WAYPOINT_SENT]);
  });

  it('leaves a waypoint added after dispatch as PENDING', () => {
    const { result } = render();
    act(() => {
      result.current.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
    });
    act(() => {
      result.current.markRouteSent();
    });
    act(() => {
      result.current.addWaypoint({ name: 'B', latitude: 2, longitude: 2 });
    });
    expect(result.current.waypoints.map((w) => w.status)).toEqual([
      WAYPOINT_SENT,
      WAYPOINT_PENDING,
    ]);
  });
});

describe('MissionContext sharing', () => {
  it('shares one route across sibling consumers', () => {
    const { result } = renderHook(() => ({ a: useMission(), b: useMission() }), { wrapper });
    act(() => {
      result.current.a.addWaypoint({ name: 'A', latitude: 1, longitude: 1 });
    });
    expect(result.current.b.waypoints).toHaveLength(1);
  });

  it('returns undefined outside a provider rather than throwing at import time', () => {
    const { result } = renderHook(() => useMission());
    expect(result.current).toBeUndefined();
  });
});

describe('MapApiContext', () => {
  const mapWrapper = ({ children }) => <MissionProvider>{children}</MissionProvider>;

  it('lets the map view register and clear its control API', () => {
    const { result } = renderHook(() => useMapApi(), { wrapper: mapWrapper });
    expect(result.current.mapApi).toBeNull();

    const api = { map: { setView: () => {} } };
    act(() => {
      result.current.setMapApi(api);
    });
    expect(result.current.mapApi).toBe(api);

    act(() => {
      result.current.setMapApi(null);
    });
    expect(result.current.mapApi).toBeNull();
  });

  // The split exists so a map mount/unmount does not re-render route
  // consumers, and route edits do not re-render map-handle consumers.
  it('is a separate context from the mission route state', () => {
    const { result } = renderHook(() => ({ mission: useMission(), map: useMapApi() }), {
      wrapper: mapWrapper,
    });
    expect(result.current.mission.mapApi).toBeUndefined();
    expect(result.current.map.waypoints).toBeUndefined();
  });
});
