import { divIcon } from 'leaflet'

export function createWaypointIcon(index: number) {
  const color = index % 3 === 0 ? '#0EA5E9' : index % 3 === 1 ? '#1D4ED8' : '#2563EB'
  return divIcon({
    className: 'custom-waypoint-marker',
    html: `
      <div style="position:relative;display:inline-flex;align-items:center;">
        <svg width="36" height="44" viewBox="0 0 36 44">
          <defs><filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.15"/></filter></defs>
          <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z" fill="${color}" filter="url(#shadow)"/>
          <circle cx="18" cy="16" r="8" fill="white" opacity="0.9"/>
          <text x="18" y="20" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">${index + 1}</text>
        </svg>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  })
}

export function createRobotMarkerIcon() {
  return divIcon({
    className: 'custom-robot-marker',
    html: `
      <div style="position:relative;">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="#1D4ED8" opacity="0.2"/>
          <circle cx="24" cy="24" r="14" fill="#1D4ED8" opacity="0.4"/>
          <circle cx="24" cy="24" r="9" fill="#1D4ED8" stroke="white" stroke-width="3"/>
        </svg>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })
}
