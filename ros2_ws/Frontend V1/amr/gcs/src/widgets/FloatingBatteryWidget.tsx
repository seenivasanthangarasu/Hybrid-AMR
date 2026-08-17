/** Floating battery widget — draggable panel showing battery status */
import { useRobotStore } from '@/stores/robotStore'
import { CircularGauge, StatusBadge } from '@/gcs-components'

export function FloatingBatteryWidget() {
  const battery = useRobotStore((s) => s.battery)
  const charging = battery.status === 'charging' || battery.status === 'full'

  return (
    <div className="w-48 bg-white/95 backdrop-blur rounded-xl border shadow-card p-4 space-y-3 text-center">
      <CircularGauge value={battery.percentage} label={`${battery.voltage.toFixed(1)}V`} />
      <StatusBadge level={charging ? 'success' : battery.percentage > 20 ? 'info' : 'warning'} label={battery.status} />
    </div>
  )
}
