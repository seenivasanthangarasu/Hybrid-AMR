/** Robot module — status display and configuration */
import { useRobotStore } from '@/stores/robotStore'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui'
import { CircularGauge, StatusBadge } from '@/gcs-components'

export default function RobotModule() {
  const battery = useRobotStore((s) => s.battery)
  const navMode = useRobotStore((s) => s.navMode)
  const speed = useRobotStore((s) => s.speed)
  const localizationStatus = useRobotStore((s) => s.localizationStatus)

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Battery card */}
      <Card>
        <CardHeader><CardTitle>Battery</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <CircularGauge value={battery.percentage} size={120} strokeWidth={8} label={`${Math.round(battery.voltage)}V`} />
          <StatusBadge level={battery.percentage > 20 ? 'success' : battery.percentage > 10 ? 'warning' : 'error'} label={`${battery.percentage}%`} />
        </CardContent>
      </Card>

      {/* Navigation mode */}
      <Card>
        <CardHeader><CardTitle>Navigation Mode</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3">
          <span className="text-2xl">{navMode === 'indoor' ? '🏠' : navMode === 'outdoor' ? '🌍' : '⚡'}</span>
          <span className="text-lg font-semibold capitalize">{navMode}</span>
        </CardContent>
      </Card>

      {/* Speed */}
      <Card>
        <CardHeader><CardTitle>Speed</CardTitle></CardHeader>
        <CardContent><span className="text-2xl font-bold">{speed.toFixed(1)} m/s</span></CardContent>
      </Card>

      {/* Localization */}
      <Card>
        <CardHeader><CardTitle>Localization</CardTitle></CardHeader>
        <CardContent>
          <StatusBadge level={localizationStatus === 'localized' ? 'success' : localizationStatus === 'localizing' ? 'info' : 'warning'} label={localizationStatus} />
        </CardContent>
      </Card>

      {/* Robot state */}
      <Card>
        <CardHeader><CardTitle>Robot State</CardTitle></CardHeader>
        <CardContent><span className="text-lg font-semibold capitalize">{useRobotStore((s) => s.robotState).replace('_', ' ')}</span></CardContent>
      </Card>

      {/* GPS / RTK */}
      <Card>
        <CardHeader><CardTitle>GPS / RTK</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-sm text-text-secondary">Fix Type</span><Badge variant="info">{useRobotStore((s) => s.gpsStatus)}</Badge></div>
          <div className="flex items-center justify-between"><span className="text-sm text-text-secondary">RTK Fix</span><Badge variant="outline">{useRobotStore((s) => s.rtkFixStatus)}</Badge></div>
        </CardContent>
      </Card>
    </div>
  )
}
