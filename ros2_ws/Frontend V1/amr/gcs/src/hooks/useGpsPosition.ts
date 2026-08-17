import { useGpsStore } from '@/stores/gpsStore'
import { useMemo } from 'react'

export function useGpsPosition() {
  const fix = useGpsStore((s) => s.fix)
  const satellites = useGpsStore((s) => s.satellites)

  return useMemo(() => {
    if (!fix) {
      return { lat: null, lng: null, alt: null, hdop: null, fixType: 'none' as const, numSats: satellites.length, signalQuality: 'poor' as const }
    }
    return {
      lat: fix.latitude ?? null,
      lng: fix.longitude ?? null,
      alt: fix.altitude ?? null,
      hdop: fix.hdop ?? null,
      fixType: fix.fixType ?? 'none',
      numSats: fix.numSats ?? satellites.length,
      signalQuality: getSignalColor(fix),
    }
  }, [fix, satellites])
}

function getSignalColor(fix: ReturnType<typeof useGpsStore.getState>['fix']): string {
  if (!fix) return '#DC2626'
  const type = fix.fixType ?? 'none'
  if (type === 'rtkFixed') return '#16A34A'
  if (type === 'rtkFloat') return '#2563EB'
  if (type === 'fix') {
    const hdop = fix.hdop ?? 1.0
    return hdop < 0.5 ? '#16A34A' : hdop < 1.0 ? '#2563EB' : '#D97706'
  }
  return '#DC2626'
}
