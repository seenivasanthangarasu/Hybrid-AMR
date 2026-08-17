/** GPS and RTK types — parsed from sensor_msgs/msg/NavSatFix (ublox_gps_node) */

export type GpsFixType = 'none' | 'fix' | 'deadReckoning' | 'time' | 'rtkFloat' | 'rtkFixed'

/** NavSatStatus constants from ublox_gps_node */
export const GPS_STATUS = { UNKNOWN: -2, NO_FIX: -1, FIX: 0, SBAS_FIX: 1, GBAS_FIX: 2 } as const

/** Satellite service bitmask */
export const GPS_SERVICE = { UNKNOWN: 0, GPS: 1, GLONASS: 2, COMPASS: 4, GALILEO: 8 } as const

export interface SatelliteInfo {
  prn: number       // satellite ID
  cno: number       // signal strength in dB-Hz
  elevation: number // degrees
  azimuth: number   // degrees
}

export interface GpsFix {
  status: number          // NavSatStatus (UNKNOWN=-2, NO_FIX=-1, FIX=0, etc.)
  service: number         // bitmask (GPS=1, GLONASS=2, COMPASS=4, GALILEO=8)
  fixType: GpsFixType     // derived from status
  latitude: number
  longitude: number
  altitude: number        // meters above WGS84 ellipsoid
  hdop: number | null    // dilution of precision (derived from covariance if available)
  numSats: number
  satellites: SatelliteInfo[]
  timestamp: number       // Unix milliseconds
}

/** Derive signal quality color from GPS status */
export function getSignalQuality(fix: GpsFix): 'excellent' | 'good' | 'fair' | 'poor' {
  if (fix.status === GPS_STATUS.NO_FIX || fix.status === GPS_STATUS.UNKNOWN) return 'poor'
  if (fix.status >= GPS_STATUS.FIX && fix.hdop != null && fix.hdop < 0.5) return 'excellent'
  if (fix.status >= GPS_STATUS.FIX && fix.hdop != null && fix.hdop < 1.0) return 'good'
  if (fix.status >= GPS_STATUS.FIX) return 'fair'
  return 'poor'
}
