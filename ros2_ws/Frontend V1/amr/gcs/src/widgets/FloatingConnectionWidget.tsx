import { useConnectionStore } from '@/stores/connectionStore'
import { useRobotStore } from '@/stores/robotStore'
import { StatusBadge } from '@/components/gcs/statusBadge'

export function FloatingConnectionWidget() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  const rssi = useRobotStore((s) => s.rssi)

  return (
    <div className="w-48 bg-white/95 backdrop-blur rounded-xl border shadow-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">📡 Signal</h3>
      <StatusBadge level={isConnected ? 'success' : 'error'} label={isConnected ? 'Connected' : 'Disconnected'} />
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">RSSI</span>
        <span className={`font-mono font-semibold ${rssi > -70 ? 'text-success' : rssi > -85 ? 'text-warning' : 'text-error'}`}>
          {isConnected ? `${rssi} dBm` : '—'}
        </span>
      </div>
    </div>
  )
}
