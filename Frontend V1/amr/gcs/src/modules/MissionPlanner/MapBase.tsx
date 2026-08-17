/** Mission Planner base map — centers on live GPS and shows AMR robot marker.
 *  GPS data flows: /fix → rosBridgeService.subscribe() → useRosTelemetry (AppLayout) → gpsStore → MapBase reads reactively */
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import { useUiStore } from '@/stores/uiStore'
import { useMissionStore } from '@/stores/missionStore'
import { useGpsStore } from '@/stores/gpsStore'
import { createRobotMarkerIcon } from '@/components/gcs/waypointMarker'
import type { LatLngTuple } from 'leaflet'

interface MapBaseProps { centerOverride?: LatLngTuple }

/** Default Tamil Nadu view used before any GPS fix arrives */
const DEFAULT_CENTER: LatLngTuple = [9.9252, 78.1198] // Madurai coordinates

function getDefaultTileLayer(layerId: string) {
  const layers = [
    { id: 'osm-standard', label: 'OpenStreetMap', urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OSM', maxZoom: 19, minZoom: 3 },
    { id: 'osm-light', label: 'CartoDB Light', urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; CARTO', maxZoom: 20, minZoom: 3 },
  ]
  return layers.find((l) => l.id === layerId) ?? layers[0]
}

export function MapBase({ centerOverride }: MapBaseProps) {
  const activeLayer = useUiStore((s) => s.activeMapLayer)
  const waypoints = useMissionStore((s) => s.waypoints)
  // Read fix reactively from gpsStore — useRosTelemetry in AppLayout writes here via setFix()
  const gpsFix = useGpsStore((s) => s.fix)
  const layerConfig = getDefaultTileLayer(activeLayer)

  /** Map center — Tamil Nadu default until first valid GPS fix arrives */
  const [center, setCenter] = useState<LatLngTuple>(() => {
    if (centerOverride) return centerOverride
    if (gpsFix?.latitude != null && Number.isFinite(gpsFix.latitude))
      return [gpsFix.latitude, gpsFix.longitude]
    return DEFAULT_CENTER
  })

  /** Whether a valid GPS fix has ever been received — drives marker visibility */
  const [hasGps, setHasGps] = useState(false)

  // React to new GPS data from useRosTelemetry → update map center + show marker
  if (gpsFix?.latitude != null && Number.isFinite(gpsFix.latitude) && !hasGps) {
    setCenter([gpsFix.latitude, gpsFix.longitude])
    setHasGps(true)
  }

  /** Resolved robot position for the marker */
  const robotPos: LatLngTuple | null = hasGps ? center : null

  return (
    <div className="w-full h-full relative">
      <MapContainer center={center} zoom={18} className="map-container">
        <TileLayer
          url={layerConfig.urlTemplate}
          attribution={layerConfig.attribution}
          maxZoom={layerConfig.maxZoom}
          minZoom={layerConfig.minZoom}
        />

        {/* ── AMR robot marker — appears once first GPS fix arrives ── */}
        {robotPos && (
          <Marker position={robotPos} icon={createRobotMarkerIcon()}>
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}>
                <b>AMR Position</b><br />
                Lat: {center[0].toFixed(6)}°<br />
                Lng: {center[1].toFixed(6)}°
              </div>
            </Popup>
          </Marker>
        )}

        {/* ── Waypoints overlay ── */}
        {waypoints.length > 0 && (
          <>
            <Polyline
              positions={waypoints.map((wp) => [wp.lat, wp.lng] as LatLngTuple)}
              color="#0EA5E9"
              weight={3}
              dashArray="8,8"
            />
            {waypoints.map((wp, i) => (
              <Marker key={wp.id} position={[wp.lat, wp.lng] as LatLngTuple}></Marker>
            ))}
          </>
        )}
      </MapContainer>

      {/* GPS status — shows until first fix */}
      {!hasGps && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-full shadow-card px-4 py-2 text-xs font-medium flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-gray-600">Waiting for GPS fix… centering on default area</span>
        </div>
      )}

      {/* GPS active */}
      {hasGps && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-green-50 rounded-full shadow-card px-4 py-2 text-xs font-medium flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          <span className="text-green-700">
            GPS: {center[0].toFixed(6)}, {center[1].toFixed(6)}
          </span>
        </div>
      )}
    </div>
  )
}
