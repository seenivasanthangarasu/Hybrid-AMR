/**
 * Unit system configuration — metric or imperial.
 * All distance/speed values display based on this setting, never hardcode units elsewhere.
 */

export type UnitSystem = 'metric' | 'imperial'

export interface UnitsConfig {
  /** Distance unit: meters (metric) or feet (imperial) */
  distanceUnit: UnitSystem
  /** Speed unit: m/s (metric) or ft/s (imperial) */
  speedUnit: UnitSystem
  /** Altitude unit: meters (metric) or feet (imperial) */
  altitudeUnit: UnitSystem
}

export const METRIC_UNITS: UnitsConfig = {
  distanceUnit: 'metric',
  speedUnit: 'metric',
  altitudeUnit: 'metric',
}

export const IMPERIAL_UNITS: UnitsConfig = {
  distanceUnit: 'imperial',
  speedUnit: 'imperial',
  altitudeUnit: 'imperial',
}

/** Convert meters to the configured distance unit */
export function convertDistance(meters: number, unit: UnitSystem): string {
  const value = unit === 'imperial' ? meters * 3.28084 : meters
  return `${value.toFixed(1)} ${unit === 'imperial' ? 'ft' : 'm'}`
}

/** Convert m/s to the configured speed unit */
export function convertSpeed(metersPerSecond: number, unit: UnitSystem): string {
  const value = unit === 'imperial' ? metersPerSecond * 3.28084 : metersPerSecond
  return `${value.toFixed(1)} ${unit === 'imperial' ? 'ft/s' : 'm/s'}`
}

/** Convert meters to the configured altitude unit */
export function convertAltitude(meters: number, unit: UnitSystem): string {
  const value = unit === 'imperial' ? meters * 3.28084 : meters
  return `${value.toFixed(1)} ${unit === 'imperial' ? 'ft' : 'm'}`
}
