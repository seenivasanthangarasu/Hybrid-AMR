/** ROS message formatting helpers */

import type { DiagnosticLevel } from '@/types'

export function formatGpsTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

export function diagnosticLevelToBadge(level: DiagnosticLevel): 'success' | 'info' | 'warning' | 'error' {
  switch (level) {
    case 'ok': return 'success'
    case 'warn': return 'warning'
    case 'error': return 'error'
    case 'fatal': return 'error'
  }
}

export function formatRosTimestamp(sec: number): string {
  const d = new Date(sec * 1000)
  return `${d.toLocaleTimeString()}.${String(Math.round((sec % 1) * 1000)).padStart(3, '0')}`
}
