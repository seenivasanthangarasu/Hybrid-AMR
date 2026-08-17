/** Leaflet map coordinate conversion utilities */

import type { LatLngTuple } from 'leaflet'

/** Convert between lat/lng and pixel coordinates on the map */
export function lngLatToPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = Math.pow(2, zoom)
  const worldX = (lng + 180) / 360 * 256 * scale
  const latRad = lat * Math.PI / 180
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 256 * scale
  return { x: worldX, y: worldY }
}

/** Convert pixel coordinates back to lat/lng */
export function pixelToLngLat(px: number, py: number, zoom: number): LatLngTuple {
  const scale = Math.pow(2, zoom)
  const lng = (px / (256 * scale)) * 360 - 180
  const n = Math.PI - (2 * Math.PI * py) / (256 * scale)
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return [lat, lng]
}
