import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import useGps from '../hooks/useGps.js';
import useOdometry from '../hooks/useOdometry.js';
import DataFallback from './DataFallback.jsx';
import { useMission, useMapApi } from '../context/MissionContext.jsx';
import { isValidLatitude, isValidLongitude, toLatLngs, WAYPOINT_SENT } from '../utils/waypoints.js';

/**
 * GpsMapView
 * Renders the robot's live position on an OSM/Leaflet map from /fix.
 * Heading arrow comes from /odom orientation.
 *
 * The mission route is drawn here as numbered, draggable waypoint markers
 * joined by a polyline from the robot's current position onward. Marker
 * lifecycle is managed imperatively against a Map<id, L.Marker> — Leaflet
 * layers live outside React, so every waypoint removed from the list must be
 * explicitly removeLayer'd or it stays on the map forever.
 */

// Fixed map-overlay colours. These are drawn on top of OpenStreetMap raster
// tiles, which are theme-independent (always the same light basemap), so they
// deliberately do NOT follow the app's light/dark theme — they're tuned for
// contrast against the map, not against the dashboard surfaces. Mirrors the
// signal palette (cyan robot/track, blue planned route) for recognisability.
const MAP_ROBOT_COLOR = '#3ddcff'; // robot marker + travelled track (signal-cyan)
const MAP_MARKER_BORDER = '#0e131c'; // dark ring around the marker for legibility
const MAP_ROUTE_COLOR = '#00b7ff'; // planned robot→goal route line
const MAP_WAYPOINT_COLOR = '#00b7ff'; // waypoint not yet dispatched
const MAP_WAYPOINT_SENT_COLOR = '#ffb020'; // dispatched, unacknowledged (signal-amber)
const MAP_WAYPOINT_SELECTED = '#ffffff'; // ring on the row selected in the planner

// Robot position marker: a cyan dot with a heading arrow. Built as a Leaflet
// divIcon (raw HTML) so it lives outside React; extracted here so the create
// and update paths share one definition instead of duplicating the markup.
function robotIcon(heading) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:18px;
        height:18px;
        border-radius:50%;
        background:${MAP_ROBOT_COLOR};
        border:2px solid ${MAP_MARKER_BORDER};
        box-shadow:0 0 8px ${MAP_ROBOT_COLOR}cc;
        position:relative;
      ">
        <div style="
          position:absolute;
          left:50%;
          top:-10px;
          transform:translateX(-50%) rotate(${heading ?? 0}deg);
          width:0;
          height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-bottom:10px solid ${MAP_ROBOT_COLOR};
        "></div>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// Numbered waypoint pin. The number is the 1-based position in the route, so
// reordering the list visibly renumbers the map without rebuilding markers.
function waypointIcon(position, sent, selected) {
  const fill = sent ? MAP_WAYPOINT_SENT_COLOR : MAP_WAYPOINT_COLOR;
  const border = selected ? MAP_WAYPOINT_SELECTED : MAP_MARKER_BORDER;
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:22px;
        height:22px;
        border-radius:50%;
        background:${fill};
        border:2px solid ${border};
        box-shadow:0 0 ${selected ? '10px' : '6px'} ${fill}cc;
        display:flex;
        align-items:center;
        justify-content:center;
        color:${MAP_MARKER_BORDER};
        font:bold 11px/1 ui-monospace,monospace;
      ">${position}</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function GpsMapView({ compact = false }) {
  const { hasData, hasEverData, lastReceivedAt, latitude, longitude, fixStatus, fixStatusCode } = useGps();
  const { heading } = useOdometry();
  const { waypoints, selectedId, setSelectedId, addWaypoint, updateWaypoint } = useMission();
  const { setMapApi } = useMapApi();

  // Click-to-add is armed, not always-on: an unarmed map click would drop a
  // waypoint on every mis-aimed pan.
  const [addMode, setAddMode] = useState(false);

  const firstFixRef = useRef(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const waypointMarkers = useRef(new Map()); // waypoint id -> L.Marker
  const pathRef = useRef(null);
  const pathPoints = useRef([]);
  const routeRef = useRef(null);
  const autoNameSeq = useRef(0);

  // Leaflet event handlers are bound once at layer-creation time, so they must
  // not close over values that change. Everything they need is read through a
  // ref refreshed on each render.
  const live = useRef({ addMode, addWaypoint, updateWaypoint, setSelectedId });
  useEffect(() => {
    live.current = { addMode, addWaypoint, updateWaypoint, setSelectedId };
  });

  // -------------------------------
  // Create map
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Captured for the cleanup closure: the ref holds one Map instance for the
    // component's lifetime, but reading `.current` at teardown time is the
    // stale-ref pattern the linter (rightly) flags.
    const markers = waypointMarkers.current;

    const map = L.map(mapRef.current, {
      zoomControl: !compact,
      attributionControl: !compact,
    }).setView([11.1271, 78.6569], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    pathRef.current = L.polyline([], {
      color: MAP_ROBOT_COLOR,
      weight: 3,
      opacity: 0.8,
    }).addTo(map);

    if (!compact) {
      map.on('click', (e) => {
        if (!live.current.addMode) return;
        const { lat, lng } = e.latlng;
        autoNameSeq.current += 1;
        live.current.addWaypoint({
          name: `WP ${autoNameSeq.current}`,
          latitude: lat.toFixed(7),
          longitude: lng.toFixed(7),
        });
      });
    }

    mapInstance.current = map;

    // Only the main (non-compact) map publishes its controls into
    // MissionContext. The right-rail preview also mounts a GpsMapView, and
    // without this guard whichever instance renders last wins the shared
    // `mapApi` — so "ADD WAYPOINT" could pan the tiny preview instead of
    // the main map (spec REQ-06).
    if (!compact) {
      setMapApi({ map });
    }

    return () => {
      map.remove();
      mapInstance.current = null;
      markers.clear();
      routeRef.current = null;
    };
  }, [compact, setMapApi]);

  // -------------------------------
  // Waypoint markers
  // -------------------------------
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || compact) return;

    const markers = waypointMarkers.current;
    const present = new Set();

    waypoints.forEach((wp, i) => {
      if (!isValidLatitude(wp.latitude) || !isValidLongitude(wp.longitude)) return;
      present.add(wp.id);

      const latlng = [Number(wp.latitude), Number(wp.longitude)];
      const icon = waypointIcon(i + 1, wp.status === WAYPOINT_SENT, wp.id === selectedId);
      const label = `${i + 1} · ${wp.name}`;
      const existing = markers.get(wp.id);

      if (existing) {
        existing.setLatLng(latlng);
        existing.setIcon(icon);
        // Position changes with reordering, so the label is refreshed on every
        // pass rather than only at creation.
        existing.setTooltipContent(label);
        return;
      }

      const marker = L.marker(latlng, { icon, draggable: true }).addTo(map);
      marker.bindTooltip(label, { direction: 'top', offset: [0, -12] });

      // Dragging the pin is the primary way to correct a position — the
      // planner list shows coordinates read-only.
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        live.current.updateWaypoint(wp.id, {
          latitude: Number(lat.toFixed(7)),
          longitude: Number(lng.toFixed(7)),
        });
      });
      marker.on('click', () => live.current.setSelectedId(wp.id));

      markers.set(wp.id, marker);
    });

    // Anything no longer in the list must come off the map explicitly.
    markers.forEach((marker, id) => {
      if (present.has(id)) return;
      map.removeLayer(marker);
      markers.delete(id);
    });
  }, [waypoints, selectedId, compact]);

  // -------------------------------
  // Robot Marker + GPS Path
  // -------------------------------
  useEffect(() => {
    const map = mapInstance.current;

    if (!map || !hasData) return;

    const latlng = [latitude, longitude];

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: robotIcon(heading) }).addTo(map);

      if (!firstFixRef.current) {
        map.setView(latlng, 19);
        firstFixRef.current = true;
      }
    } else {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(robotIcon(heading));
    }

    if (!compact) {
      pathPoints.current.push(latlng);

      if (pathPoints.current.length > 5000) {
        pathPoints.current.shift();
      }

      pathRef.current?.setLatLngs(pathPoints.current);
    }
  }, [hasData, latitude, longitude, heading, compact]);

  // -------------------------------
  // Route Line
  // -------------------------------
  // Straight legs between waypoints in list order, starting from the robot's
  // current position. This is the ORDER the operator has queued, not a path
  // the planner has produced — Nav2 computes the real drivable route, and
  // nothing here should be read as obstacle-aware.
  useEffect(() => {
    const map = mapInstance.current;

    if (!map || compact) return;

    const legs = toLatLngs(waypoints);
    const points = hasData ? [[latitude, longitude], ...legs] : legs;

    if (points.length < 2) {
      if (routeRef.current) {
        map.removeLayer(routeRef.current);
        routeRef.current = null;
      }
      return;
    }

    if (!routeRef.current) {
      routeRef.current = L.polyline(points, {
        color: MAP_ROUTE_COLOR,
        weight: 4,
        opacity: 0.8,
        dashArray: '8,8',
      }).addTo(map);
    } else {
      routeRef.current.setLatLngs(points);
    }
  }, [hasData, latitude, longitude, waypoints, compact]);

  return (
    <div className="relative h-full w-full">
      {/* The container's className MUST stay static. L.map() adds its own
          classes (leaflet-container, leaflet-grab, …) to this node
          imperatively, and React rewriting className on a later render wipes
          them — which silently strips the map's CSS and its click handling.
          Reactive styling therefore goes through inline style, which React
          patches property-by-property instead of replacing wholesale. */}
      <div
        ref={mapRef}
        className="h-full w-full"
        style={addMode ? { cursor: 'crosshair' } : undefined}
      />

      {!hasData && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-deck-900/85">
          <DataFallback topic="/fix" hasEverData={hasEverData} lastReceivedAt={lastReceivedAt} />
        </div>
      )}

      {!compact && (
        <button
          type="button"
          onClick={() => setAddMode((v) => !v)}
          aria-pressed={addMode}
          title={
            addMode
              ? 'Click the map to append a waypoint — click here to stop'
              : 'Arm click-to-add so map clicks append waypoints'
          }
          className={`absolute right-3 top-3 z-[1000] rounded px-2.5 py-1.5 font-display text-[10px] font-bold tracking-[0.1em] ring-1 transition-colors ${
            addMode
              ? 'bg-signal-cyan/30 text-signal-cyan ring-signal-cyan/60'
              : 'bg-deck-900/85 text-ink-mid ring-deck-line hover:text-signal-cyan'
          }`}
        >
          {addMode ? '● ADDING — CLICK MAP' : '+ ADD WAYPOINT'}
        </button>
      )}

      {hasData && !compact && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded panel px-3 py-2 shadow-panel">
          <div className="data-label">GPS STATUS</div>

          <div
            className={`data-value text-sm font-semibold ${
              fixStatusCode != null && fixStatusCode >= 0 ? 'text-signal-green' : 'text-signal-red'
            }`}
          >
            {fixStatus}
          </div>
        </div>
      )}
    </div>
  );
}
