/** Input validation helpers */

/** Validate a WebSocket URL format */
export function isValidWsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
  } catch {
    return false
  }
}

/** Validate a latitude value */
export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

/** Validate a longitude value */
export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

/** Validate an IP address or hostname */
export function isValidHost(host: string): boolean {
  // Simple check — accepts IPs and hostnames
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
  return ipRegex.test(host) || /^[a-zA-Z0-9][-a-zA-Z0-9]*([.[a-zA-Z0-9][-a-zA-Z0-9]]*)?$/.test(host)
}
