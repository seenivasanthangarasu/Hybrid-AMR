/** Dashboard — Google Maps-style interactive map with live GPS robot positioning AND camera feed */
import React, { useEffect, useState } from 'react'
import { useRobotStore } from '@/stores/robotStore'
import { rosBridgeService } from '@/services/ros/connection'
import { StatusBadge, CircularGauge } from '@/gcs-components'

/** Tile layers — switchable like Google Maps */
const TILE_LAYERS = [
  { id: 'standard', name: 'Map', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors' },
  { id: 'satellite', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
  { id: 'terrain', name: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenTopoMap' },
  { id: 'streets', name: 'Streets', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
] as const

export default function Dashboard() {
  const [connected, setConnected] = useState(false)
  // Tamil Nadu coordinates (Madurai region) at 5x zoom as initial view
  const [mapCenter, setMapCenter] = React.useState<[number, number]>([9.9252, 78.1198])
  const [zoom, setZoom] = React.useState(5)
  const [activeTile, setActiveTile] = React.useState(TILE_LAYERS[0])
  const [hasGpsData, setHasGpsData] = React.useState(false)
  const [cameraUrl, setCameraUrl] = React.useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)

  const battery = useRobotStore((s) => s.battery)
  const updateTelemetry = useRobotStore((s) => s.updateTelemetry)
  const setRobotState = useRobotStore((s) => s.setRobotState)

  // ─── Check rosbridge availability with actual connection test ───
  useEffect(() => {
    verifyRosbridgeConnection().then((isConnected) => {
      setConnected(isConnected)
    })

    // Poll every 5 seconds to check if connection is still alive
    const interval = setInterval(async () => {
      const isConnected = await verifyRosbridgeConnection()
      setConnected(isConnected)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Zoom buttons component
  const ZoomButtons = () => (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setZoom(z => Math.min(z + 1, 20))}
        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 border-b border-gray-200 font-bold text-xl">+</button>
      <button onClick={() => setZoom(z => Math.max(z - 1, 3))}
        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-xl">−</button>
    </div>
  )

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gray-100">
      {/* Top-left card — app name + status */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 px-5 py-4 min-w-[260px]">
          <h1 className="text-lg font-bold text-sky-700 mb-1">🤖 Hybrid AMR GCS</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
            <StatusBadge level={connected ? 'success' : 'error'} label={connected ? 'ROS Connected' : 'Disconnected'} />
            <span>|</span>
            <CircularGauge value={battery.percentage} size={32} strokeWidth={4} showPercentage />
          </div>
          <p className="text-xs text-gray-400">Click and drag to pan • Scroll to zoom</p>
        </div>

        {/* Tile layer switcher */}
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          {TILE_LAYERS.map((layer) => (
            <button key={layer.id} onClick={() => setActiveTile(layer)}
              className={`w-full px-4 py-2.5 text-left text-xs font-semibold transition-all ${activeTile.id === layer.id ? 'bg-sky-50 text-sky-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span className="mr-2">🗺️</span>
              {layer.name}
            </button>
          ))}
        </div>

        {/* GPS status - only shown when data is available */}
        {hasGpsData && (
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 px-5 py-4">
            <h3 className="text-sm font-bold text-green-700 mb-1">🛰️ GPS Status</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <div><span className="font-semibold">Lat:</span> {mapCenter[0].toFixed(8)}°</div>
              <div><span className="font-semibold">Lng:</span> {mapCenter[1].toFixed(8)}°</div>
            </div>
          </div>
        )}
      </div>

      {/* Right side — Google Maps-style zoom controls */}
      <div className="absolute top-[320px] right-4 z-[1000] flex flex-col items-center gap-2">
        <ZoomButtons />
      </div>

      {/* Bottom-left scale */}
      <div className="absolute bottom-3 left-4 z-[1000] bg-white/90 px-3 py-1.5 rounded-md shadow border text-xs text-gray-600">
        Center: {mapCenter[0].toFixed(4)}°, {mapCenter[1].toFixed(4)}° | Zoom: {zoom}
      </div>

      {/* Main map area — takes full screen */}
      <div className="w-full h-screen relative">
        <MapGoogleStyle center={mapCenter} zoom={zoom} tileUrl={activeTile.url} attribution={activeTile.attr} />

        {/* Camera overlay in bottom-right corner */}
        <CameraFeed currentUrl={cameraUrl} />
      </div>
    </div>
  )
}

/** Google Maps-style interactive map using Leaflet with robot positioning */
function MapGoogleStyle({ center, zoom, tileUrl, attribution }: {
  center: [number, number]
  zoom: number
  tileUrl: string
  attribution: string
}) {
  const mapElRef = React.useRef<HTMLDivElement>(null)
  const LRef = React.useRef<any>(null)
  const mapRef = React.useRef<any>(null)
  const [robotMarker, setRobotMarker] = React.useState<any>(null)

  // Dynamically load Leaflet CSS + JS once
  React.useEffect(() => {
    if (LRef.current || !mapElRef.current) return

    // Load CSS
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Load JS if not already loaded
    if (typeof window !== 'undefined' && (window as any).L) {
      LRef.current = (window as any).L
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      LRef.current = (window as any).L
    }
    document.head.appendChild(script)
  }, [])

  // Initialize map once Leaflet is loaded AND subscribe to GPS data
  React.useEffect(() => {
    if (!LRef.current || !mapElRef.current || mapRef.current) return

    const L = LRef.current

    // Create map with Google Maps-style controls disabled (we use our own)
    mapRef.current = L.map(mapElRef.current, {
      center: [0, 0],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true, // Smoother like Google Maps
      touchZoom: true,   // Pinch-to-zoom like phone maps
      dragging: true,    // Click-drag to pan like Google Maps
      doubleClickZoom: true,
      scrollWheelZoom: true,
    })

    L.tileLayer(tileUrl, { attribution }).addTo(mapRef.current)

    // Subscribe to /fix (GPS) — center map on robot position and zoom when GPS arrives
    const fixSub = rosBridgeService.subscribe('/fix', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Record<string, any>
      const lat = m['latitude'] ?? 0
      const lng = m['longitude'] ?? 0

      // Update map center with GPS data and zoom in when GPS is available
      if (lat && lng) {
        setMapCenter([lat, lng])
        setHasGpsData(true)

        // Zoom to full detail when GPS arrives
        setZoom(18)

        // Create robot marker on first GPS data
        const robotIcon = L.divIcon({
          className: 'robot-marker',
          html: `
            <div style="position:relative;width:30px;height:30px;">
              <svg width="30" height="30" viewBox="0 0 30 30">
                <circle cx="15" cy="15" r="12" fill="#3b82f6" opacity="0.4"/>
                <circle cx="15" cy="15" r="8" fill="#3b82f6" opacity="0.7"/>
                <circle cx="15" cy="15" r="5" fill="#1d4ed8" stroke="white" stroke-width="2"/>
              </svg>
            </div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        })

        const newMarker = L.marker([lat, lng], { icon: robotIcon }).addTo(mapRef.current)
        mapRef.current.panTo([lat, lng])
        setRobotMarker(newMarker)
      }
    })

    // Subscribe to /odom for speed tracking
    const odomSub = rosBridgeService.subscribe('/odom', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as Record<string, any>
      const pose = (m['pose']?.['pose'] ?? m['pose']) as Record<string, number> | undefined
      const lin = (m['twist']?.['twist'] ?? m['twist']) as Record<string, any> | undefined

      if (pose) {
        updateTelemetry({ speed: Math.sqrt((lin?.['x'] ?? 0) ** 2 + (lin?.['y'] ?? 0) ** 2) })
        setRobotState('idle' as const)

        // Update robot marker position with odometry data
        if (!robotMarker && mapRef.current) {
          const x = pose['x'] ?? 0
          const y = pose['y'] ?? 0
          const robotIcon = L.divIcon({
            className: 'robot-marker',
            html: `
              <div style="position:relative;width:40px;height:40px;">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" fill="#3b82f6" opacity="0.3"/>
                  <circle cx="20" cy="20" r="10" fill="#3b82f6" opacity="0.5"/>
                  <circle cx="20" cy="20" r="7" fill="#1d4ed8" stroke="white" stroke-width="3"/>
                </svg>
              </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          })

          const newMarker = L.marker([x, y], { icon: robotIcon }).addTo(mapRef.current)
          mapRef.current.panTo([x, y])
          setRobotMarker(newMarker)
        } else if (robotMarker && pose['x']) {
          robotMarker.setLatLng([pose['x'], pose['y']])
        }
      }
    })

    // Cleanup subscriptions on unmount
    return () => {
      fixSub.unsubscribe()
      odomSub.unsubscribe()
    }
  }, [])

  // Update map center/zoom when they change (from GPS data)
  React.useEffect(() => {
    if (!mapRef.current || !LRef.current) return
    mapRef.current.setView(center, zoom, { animate: true })
  }, [center, zoom])

  // Update tile layer when switch changes
  React.useEffect(() => {
    if (!mapRef.current || !LRef.current) return
    L.tileLayer(tileUrl, { attribution }).addTo(mapRef.current)
  }, [tileUrl])

  return (
    <div ref={mapElRef} className="w-full h-screen cursor-grab active:cursor-grabbing" style={{ touchAction: 'manipulation' }} />
  )
}

/** Live camera feed — pulls stream URL from web_video_server (port 8080) */
function CameraFeed({ currentUrl }: { currentUrl: string | null }) {
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [streamError, setStreamError] = React.useState<string | null>(null)

  // Build stream URL from the rosbridge host + web_video_server port 8080
  useEffect(() => {
    // Derive web_video_server URL from rosbridge config
    let webServerUrl = ''
    try {
      const configUrl = (window as any).__rosBridgeConfig?.url || 'ws://localhost:9090'
      const url = new URL(configUrl)
      const proto = configUrl.startsWith('wss') ? 'https' : 'http'
      webServerUrl = `${proto}://${url.host}:8080/stream?topic=/camera/camera/color/image_raw`
    } catch {
      // Fallback — user can configure in Settings
      webServerUrl = `http://192.168.1.100:8080/stream?topic=/camera/camera/color/image_raw`
    }

    if (!webServerUrl) return

    setIsStreaming(true)
    setStreamError(null)
    // Store URL for <img> src
    ;(document.activeElement as any)?.dispatchEvent(new CustomEvent('set-camera-url', { detail: webServerUrl }))
  }, [])

  if (!isStreaming) return null

  return (
    <div className="absolute bottom-4 right-4 z-[1000] w-80 h-60 bg-black rounded-xl shadow-xl overflow-hidden border border-gray-300">
      {/* Camera header */}
      <div className="bg-gray-900 text-white px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-bold">📷 Live Feed</span>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${streamError ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></div>
          <span className={`text-xs ${streamError ? 'text-red-400' : 'text-green-400'}`}>
            {streamError ? '● OFFLINE' : '● LIVE'}
          </span>
        </div>
      </div>

      {/* Camera video/image display */}
      <div className="w-full h-full relative bg-gray-900">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt="Live Camera Feed"
            className="w-full h-full object-contain"
            onError={() => setStreamError('web_video_server unreachable')}
            onLoad={() => setStreamError(null)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <p className="text-sm">{streamError ? 'Camera unavailable' : 'Loading camera...'}</p>
          </div>
        )}

        {/* Camera overlay info */}
        <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
          <div>/camera/camera/color/image_raw</div>
          <div className="text-green-400">Sensor: RealSense</div>
        </div>
      </div>
    </div>
  )
}

/** Check if rosbridge is available */
function canConnectToRosBridge(): boolean {
  try {
    new WebSocket('ws://localhost:9090')
    return true
  } catch {
    return false
  }
}

/** Verify connection by sending a message to rosbridge */
async function verifyRosbridgeConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:9090')
    ws.onopen = () => {
      // Send a test rosapi call to verify we can communicate
      ws.send(JSON.stringify({
        op: 'call_service',
        service: '/rosapi/topics',
        type: 'rosapi/ServicesResponse'
      }))

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          // If we get a valid response, connection is working
          if (msg.msg || msg.op === 'service_response') {
            resolve(true)
          } else {
            resolve(false)
          }
        } catch {
          resolve(false)
        } finally {
          ws.close()
        }
      }

      ws.onerror = () => resolve(false)
    }

    // Timeout after 2 seconds
    setTimeout(() => {
      resolve(false)
      ws.close()
    }, 2000)
  })
}
