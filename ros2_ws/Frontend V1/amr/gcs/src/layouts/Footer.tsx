import { useRobotStore } from '@/stores/robotStore'

export default function Footer() {
  const battery = useRobotStore((s) => s.battery)
  const navMode = useRobotStore((s) => s.navMode)
  const robotState = useRobotStore((s) => s.robotState)
  const localizationStatus = useRobotStore((s) => s.localizationStatus)

  return (
    <footer className="h-[var(--footer-height)] flex items-center justify-between px-4 border-t border-border bg-bg-secondary text-xs">
      <div className="flex items-center gap-4">
        <span className={battery.percentage > 20 ? 'text-success font-medium' : 'text-error font-semibold'}>
          {battery.percentage > 0 ? `${Math.round(battery.percentage)}% Battery` : 'No Data'}
        </span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary capitalize">{navMode} Mode</span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary capitalize">{robotState.replace('_', ' ')}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className={localizationStatus === 'localized' ? 'text-success font-medium' : 'text-warning font-medium'}>
          {localizationStatus}
        </span>
      </div>
    </footer>
  )
}
