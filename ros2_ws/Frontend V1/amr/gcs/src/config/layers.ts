/**
 * Map tile layer configuration.
 * OSM tiles used by default — add custom layers via the Settings module at runtime.
 */

export interface MapTileLayer {
  /** Unique identifier for this layer */
  id: string
  /** Display name in the layer selector */
  label: string
  /** Leaflet tile URL template */
  urlTemplate: string
  /** Attribution string shown on the map */
  attribution: string
  /** Maximum zoom level supported */
  maxZoom: number
  /** Minimum zoom level supported */
  minZoom: number
}

/** Default public OpenStreetMap tiles — no API key required */
export const DEFAULT_TILE_LAYERS: MapTileLayer[] = [
  {
    id: 'osm-standard',
    label: 'OpenStreetMap',
    urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
    minZoom: 3,
  },
  {
    id: 'osm-carto',
    label: 'CartoDB Light',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
    minZoom: 3,
  },
]

/** The default layer used when no user preference is set */
export const DEFAULT_LAYER_ID = 'osm-light'
