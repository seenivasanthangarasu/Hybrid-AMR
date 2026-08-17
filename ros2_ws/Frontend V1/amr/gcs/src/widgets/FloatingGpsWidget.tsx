/** Floating GPS widget — draggable panel showing real-time GPS/RTK data */
import { useGpsPosition } from '@/hooks/useGpsPosition'
import { StatusBadge } from '@/components/gcs/statusBadge'

export function FloatingGpsWidget() {
  const { lat, lng, alt, hdop, fixType, numSats, signalQuality } = useGpsPosition()

  return (
    <div className="w-64 bg-white/95 backdrop-blur rounded-xl border shadow-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
        <span className="text-base">🛰️</span> GPS / RTK
      </h3>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-text-secondary">Latitude</span><span className="font-mono font-semibold">{lat?.toFixed(8) ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-text-secondary">Longitude</span><span className="font-mono font-semibold">{lng?.toFixed(8) ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-text-secondary">Altitude</span><span className="font-mono font-semibold">{alt != null ? `${alt.toFixed(1)} m` : '—'}</span></div>
      </div>

      <hr className="border-border" />

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-text-secondary">Fix Type</span><StatusBadge level={fixType === 'rtkFixed' ? 'success' : fixType === 'fix' ? 'info' : 'warning'} label={fixType} /></div>
        <div className="flex justify-between"><span className="text-text-secondary">HDOP</span><span className="font-mono font-semibold">{hdop?.toFixed(2) ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-text-secondary">Satellites</span><span className="font-mono font-semibold">{numSats}</span></div>
        <div className="flex justify-between"><span className="text-text-secondary">Signal Quality</span><StatusBadge level={signalQuality === 'excellent' ? 'success' : signalQuality === 'good' ? 'info' : signalQuality === 'fair' ? 'warning' : 'error'} label={signalQuality} /></div>
      </div>
    </div>
  )
}
