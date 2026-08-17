import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export type StatusLevel = 'success' | 'info' | 'warning' | 'error' | 'neutral'

interface StatusBadgeProps {
  level: StatusLevel
  label: string
  className?: string
}

const LEVEL_MAP: Record<StatusLevel, { badgeVariant: 'success' | 'info' | 'warning' | 'error' | 'outline'; dotColor: string }> = {
  success:   { badgeVariant: 'success', dotColor: '#16A34A' },
  info:      { badgeVariant: 'info',    dotColor: '#2563EB' },
  warning:   { badgeVariant: 'warning', dotColor: '#D97706' },
  error:     { badgeVariant: 'error',   dotColor: '#DC2626' },
  neutral:   { badgeVariant: 'outline', dotColor: '#94A3B8' },
}

export function StatusBadge({ level, label, className }: StatusBadgeProps) {
  const { badgeVariant, dotColor } = LEVEL_MAP[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <Badge variant={badgeVariant}>{label}</Badge>
    </span>
  )
}
