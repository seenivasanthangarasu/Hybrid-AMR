import { useEffect, useRef } from 'react';
import L from 'leaflet';
import useGps from '../hooks/useGps.js';
import useOdometry from '../hooks/useOdometry.js';
import NoDataBadge from './NoDataBadge.jsx';

export default function GpsPreviewMap() {
  const { hasData, latitude, longitude } = useGps();
  const { heading } = useOdometry();

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
    }).setView([11.1271, 78.6569], 7);   // Tamil Nadu

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
    }).addTo(map);

    mapInstance.current = map;

    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!hasData) return;

    const map = mapInstance.current;
    if (!map) return;

    const pos = [latitude, longitude];

    const icon = L.divIcon({
      className: '',
      html: `
      <div style="
        width:16px;
        height:16px;
        border-radius:50%;
        background:#3ddcff;
        border:2px solid white;
        box-shadow:0 0 10px #3ddcff;
        position:relative;">
        <div style="
          position:absolute;
          left:50%;
          top:-10px;
          transform:translateX(-50%) rotate(${heading ?? 0}deg);
          width:0;
          height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-bottom:10px solid #3ddcff;">
        </div>
      </div>
      `,
      iconSize: [18,18],
      iconAnchor: [9,9],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker(pos,{icon}).addTo(map);
    } else {
      markerRef.current.setLatLng(pos);
      markerRef.current.setIcon(icon);
    }

    map.setView(pos,15,{
      animate:true
    });

  }, [hasData, latitude, longitude, heading]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full"/>

      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/60">
          <NoDataBadge label="WAITING FOR GPS"/>
        </div>
      )}
    </div>
  );
}
