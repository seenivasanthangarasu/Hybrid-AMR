import { useEffect, useRef } from 'react';
import L from 'leaflet';
import useGps from '../hooks/useGps.js';
import useOdometry from '../hooks/useOdometry.js';
import DataFallback from './DataFallback.jsx';
import { useMission } from '../context/MissionContext.jsx';

/**
 * GpsMapView
 * Renders the robot's live position on an OSM/Leaflet map from /fix.
 * Heading arrow comes from /odom orientation.
 */

// Fixed map-overlay colours. These are drawn on top of OpenStreetMap raster
// tiles, which are theme-independent (always the same light basemap), so they
// deliberately do NOT follow the app's light/dark theme — they're tuned for
// contrast against the map, not against the dashboard surfaces. Mirrors the
// signal palette (cyan robot/track, blue planned route) for recognisability.
const MAP_ROBOT_COLOR = '#3ddcff'; // robot marker + travelled track (signal-cyan)
const MAP_MARKER_BORDER = '#0e131c'; // dark ring around the marker for legibility
const MAP_ROUTE_COLOR = '#00b7ff'; // planned robot→goal route line

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
export default function GpsMapView({ compact = false }) {
  const { hasData, hasEverData, lastReceivedAt, latitude, longitude, fixStatus, fixStatusCode } = useGps();
  const { heading } = useOdometry();
  const { destination, setDestination, setMapApi } = useMission();

  const firstFixRef = useRef(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const pathRef = useRef(null);
  const pathPoints = useRef([]);
  const routeRef = useRef(null);

  // -------------------------------
  // Create map
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

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
        const { lat, lng } = e.latlng;

        setDestination((prev) => ({
          ...prev,
          latitude: lat.toFixed(7),
          longitude: lng.toFixed(7),
        }));
      });
    }

    mapInstance.current = map;

    // Only the main (non-compact) map publishes its controls into
    // MissionContext. The right-rail preview also mounts a GpsMapView, and
    // without this guard whichever instance renders last wins the shared
    // `mapApi` — so "USE COORDINATES" could pan the tiny preview instead of
    // the main map (spec REQ-06).
    if (!compact) {
      setMapApi({
        map,
        destinationMarkerRef,
      });
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [compact, setDestination, setMapApi]);

  // -------------------------------
  // Destination Marker
  // -------------------------------
  useEffect(() => {
    const map = mapInstance.current;

    if (!map || compact) return;

    if (destination.latitude === '' || destination.longitude === '') {
      return;
    }

    const lat = parseFloat(destination.latitude);
    const lng = parseFloat(destination.longitude);

    if (isNaN(lat) || isNaN(lng)) return;

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = L.marker([lat, lng]).addTo(map);
    } else {
      destinationMarkerRef.current.setLatLng([lat, lng]);
    }
  }, [destination, compact]);

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
  useEffect(() => {
    const map = mapInstance.current;

    if (!map || compact) return;

    if (!hasData || destination.latitude === '' || destination.longitude === '') {
      if (routeRef.current) {
        map.removeLayer(routeRef.current);
        routeRef.current = null;
      }
      return;
    }

    const robot = [latitude, longitude];
    const goal = [parseFloat(destination.latitude), parseFloat(destination.longitude)];

    if (!routeRef.current) {
      routeRef.current = L.polyline([robot, goal], {
        color: MAP_ROUTE_COLOR,
        weight: 4,
        opacity: 0.8,
        dashArray: '8,8',
      }).addTo(map);
    } else {
      routeRef.current.setLatLngs([robot, goal]);
    }
  }, [hasData, latitude, longitude, destination, compact]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {!hasData && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-deck-900/85">
          <DataFallback topic="/fix" hasEverData={hasEverData} lastReceivedAt={lastReceivedAt} />
        </div>
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
