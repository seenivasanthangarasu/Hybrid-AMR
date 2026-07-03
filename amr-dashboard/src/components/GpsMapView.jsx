import { useEffect, useRef } from 'react';
import L from 'leaflet';
import useGps from '../hooks/useGps.js';
import useOdometry from '../hooks/useOdometry.js';
import NoDataBadge from './NoDataBadge.jsx';

/**
 * GpsMapView
 * Renders the robot's live position on an OSM/Leaflet map from /fix.
 * Heading arrow comes from /odom orientation. The travelled path is
 * built by appending each real GPS fix received — never interpolated
 * or faked between points.
 */
export default function GpsMapView({ compact = false }) {
  const { hasData, latitude, longitude, fixStatus, fixStatusCode } = useGps();
  const { heading } = useOdometry();

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const pathRef = useRef(null);
  const pathPoints = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: !compact,
      attributionControl: !compact,
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    pathRef.current = L.polyline([], { color: '#3ddcff', weight: 3, opacity: 0.8 }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !hasData || latitude == null || longitude == null) return;

    const latlng = [latitude, longitude];

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3ddcff;border:2px solid #0e131c;box-shadow:0 0 8px rgba(61,220,255,0.8);transform:rotate(${heading ?? 0}deg)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current = L.marker(latlng, { icon }).addTo(map);
      map.setView(latlng, 19);
    } else {
      markerRef.current.setLatLng(latlng);
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3ddcff;border:2px solid #0e131c;box-shadow:0 0 8px rgba(61,220,255,0.8);position:relative">
                 <div style="position:absolute;left:50%;top:-10px;transform:translateX(-50%) rotate(${heading ?? 0}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #3ddcff;"></div>
               </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current.setIcon(icon);
    }

    pathPoints.current.push(latlng);
    if (pathPoints.current.length > 5000) pathPoints.current.shift();
    pathRef.current?.setLatLngs(pathPoints.current);
  }, [hasData, latitude, longitude, heading]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />
      {!hasData && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-deck-900/85">
          <NoDataBadge label="NO GPS FIX — /fix" />
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
