import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  createWaypoint,
  moveWaypoint as moveInList,
  WAYPOINT_PENDING,
  WAYPOINT_SENT,
} from '../utils/waypoints.js';

/**
 * Mission state is split across TWO contexts on purpose.
 *
 * The previous single context bundled destination + routeInfo + mapApi with a
 * note to split it once a 4th piece of shared state appeared. The waypoint list
 * (plus selection) is that trigger: `mapApi` is a transient UI handle that
 * changes when the map mounts/unmounts, and every waypoint edit would otherwise
 * re-render anything holding the map handle, and vice versa.
 *
 * - MissionContext  → domain state (the route the operator is building)
 * - MapApiContext   → the live Leaflet handle published by the main map
 *
 * Both provider values are memoized so a re-render of MissionProvider's parent
 * doesn't cascade into every consumer (audit F24).
 */
const MissionContext = createContext();
const MapApiContext = createContext();

export function MissionProvider({ children }) {
  // Ordered route. Empty = nothing to send; nothing is ever pre-seeded, so no
  // coordinate the operator did not enter can reach the robot.
  const [waypoints, setWaypoints] = useState([]);

  // Row highlighted in the planner / emphasized on the map. Not part of the
  // route contract — purely which one the operator is looking at.
  const [selectedId, setSelectedId] = useState(null);

  const [routeInfo, setRouteInfo] = useState({ distance: 0, eta: 0 });

  const addWaypoint = useCallback((partial) => {
    const wp = createWaypoint(partial);
    setWaypoints((prev) => [...prev, wp]);
    setSelectedId(wp.id);
    return wp;
  }, []);

  const updateWaypoint = useCallback((id, patch) => {
    setWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)));
  }, []);

  const removeWaypoint = useCallback((id) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const moveWaypoint = useCallback((id, delta) => {
    setWaypoints((prev) => moveInList(prev, id, delta));
  }, []);

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
    setSelectedId(null);
  }, []);

  /**
   * Called after a route dispatch that did not throw. Marks waypoints
   * SENT_UNCONFIRMED — never "reached", never "active". The robot has not
   * acknowledged anything; all this records is that the dashboard put the
   * route on the wire.
   */
  const markRouteSent = useCallback(() => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.status === WAYPOINT_PENDING ? { ...wp, status: WAYPOINT_SENT } : wp)),
    );
  }, []);

  const value = useMemo(
    () => ({
      waypoints,
      selectedId,
      setSelectedId,
      addWaypoint,
      updateWaypoint,
      removeWaypoint,
      moveWaypoint,
      clearWaypoints,
      markRouteSent,
      routeInfo,
      setRouteInfo,
    }),
    [
      waypoints,
      selectedId,
      addWaypoint,
      updateWaypoint,
      removeWaypoint,
      moveWaypoint,
      clearWaypoints,
      markRouteSent,
      routeInfo,
    ],
  );

  return (
    <MissionContext.Provider value={value}>
      <MapApiProvider>{children}</MapApiProvider>
    </MissionContext.Provider>
  );
}

function MapApiProvider({ children }) {
  const [mapApi, setMapApi] = useState(null);
  const value = useMemo(() => ({ mapApi, setMapApi }), [mapApi]);
  return <MapApiContext.Provider value={value}>{children}</MapApiContext.Provider>;
}

export function useMission() {
  return useContext(MissionContext);
}

export function useMapApi() {
  return useContext(MapApiContext);
}
