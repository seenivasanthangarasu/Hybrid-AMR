/** Mission planning types — waypoints, missions, and their states */

import { uuid } from '@/utils/uuid'

export interface Waypoint {
  /** Unique identifier */
  id: string
  /** Human-readable name (e.g., "Pickup Point A") */
  name: string
  /** Latitude in decimal degrees */
  lat: number
  /** Longitude in decimal degrees */
  lng: number
  /** Heading angle in degrees (0–360) */
  heading: number
  /** Speed at this waypoint in m/s */
  speed: number
  /** Arrival radius in meters — triggers "arrived" event */
  arrivalRadius: number
  /** Wait time in seconds at this waypoint */
  waitTime: number
  /** Optional action name to trigger upon arrival */
  action: string | null
  /** Free-text notes for the operator */
  notes: string
}

/** Create a new waypoint with default values */
export function createWaypoint(lat: number, lng: number, index: number): Waypoint {
  return {
    id: uuid(),
    name: `WP-${String(index + 1).padStart(3, '0')}`,
    lat,
    lng,
    heading: 0,
    speed: 1.0,
    arrivalRadius: 0.5,
    waitTime: 0,
    action: null,
    notes: '',
  }
}

export type MissionStatus = 'idle' | 'planning' | 'ready' | 'executing' | 'paused' | 'error'

export interface Mission {
  /** Ordered list of waypoints */
  waypoints: Waypoint[]
  /** Index of the currently active waypoint during execution */
  activeWaypointIndex: number | null
  currentStatus: MissionStatus
  /** Error message when status is 'error' */
  error: string | null
}

/** Create an empty (idle) mission */
export function createEmptyMission(): Mission {
  return { waypoints: [], activeWaypointIndex: null, currentStatus: 'idle', error: null }
}
