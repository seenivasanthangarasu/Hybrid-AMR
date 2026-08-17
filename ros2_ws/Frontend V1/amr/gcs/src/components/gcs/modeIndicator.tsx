import { cn } from '@/lib/utils'
import type { NavMode } from '@/types/robot'

interface ModeIndicatorProps {
  modes: NavMode[]
  activeMode: NavMode
  onModeChange?: (mode: NavMode) => void
}

const MODE_LABELS: Record<NavMode, string> = { indoor: 'Indoor', outdoor: 'Outdoor', hybrid: 'Hybrid' }
const MODE_ICONS: Record<NavMode, string> = { indoor: '🏠', outdoor: '🌍', hybrid: '⚡' }

export function ModeIndicator({ modes, activeMode, onModeChange }: ModeIndicatorProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-bg-secondary rounded-lg border border-border">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onModeChange?.(mode)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-all',
            activeMode === mode ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <span>{MODE_ICONS[mode]}</span>
          <span>{MODE_LABELS[mode]}</span>
        </button>
      ))}
    </div>
  )
}
