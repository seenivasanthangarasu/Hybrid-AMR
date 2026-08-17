/** Waypoint validation and manipulation utilities */

import type { Waypoint } from '@/types'

export interface ValidationRule {
  field: keyof Pick<Waypoint, 'lat' | 'lng' | 'name' | 'heading' | 'speed'>
  min?: number
  max?: number
  message?: string
}

/** Default validation rules for waypoint fields */
const DEFAULT_RULES: ValidationRule[] = [
  { field: 'lat', min: -90, max: 90, message: 'Latitude must be between -90 and 90' },
  { field: 'lng', min: -180, max: 180, message: 'Longitude must be between -180 and 180' },
  { field: 'name', min: 1, max: 50, message: 'Name must be 1-50 characters' },
  { field: 'heading', min: 0, max: 360, message: 'Heading must be between 0 and 360 degrees' },
  { field: 'speed', min: 0.01, max: 10, message: 'Speed must be between 0.01 and 10 m/s' },
]

/** Validate a waypoint against the default rules */
export function validateWaypoint(wp: Waypoint, rules: ValidationRule[] = DEFAULT_RULES): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const rule of rules) {
    const value = wp[rule.field]

    if (rule.field === 'name') {
      if (typeof value === 'string' && (!value || value.trim().length < 1)) {
        errors.push(rule.message ?? `${rule.field} cannot be empty`)
      }
    } else if (typeof value === 'number') {
      if (rule.min != null && value < rule.min) errors.push(rule.message ?? `${rule.field} must be >= ${rule.min}`)
      if (rule.max != null && value > rule.max) errors.push(rule.message ?? `${rule.field} must be <= ${rule.max}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/** Check if a waypoint is within the arrival radius of a position */
export function isWithinArrivalRadius(waypoint: Waypoint, lat: number, lng: number, radiusMeters: number): boolean {
  const distance = haversineDistance(waypoint.lat, waypoint.lng, lat, lng)
  return distance <= radiusMeters
}

// Re-use haversine from geometry utils — import here in the actual codebase
import { haversineDistance } from './geometry'
