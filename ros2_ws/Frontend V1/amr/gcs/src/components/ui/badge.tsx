import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'info' | 'warning' | 'error' | 'outline'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const badgeColors: Record<BadgeVariant, string> = {
  default: 'bg-brand/10 text-brand',
  success: 'bg-success-bg text-success',
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
  outline: 'border border-border text-text-secondary bg-transparent',
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = 'default' as const, ...props }, ref) => (
  <span ref={ref} className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full', badgeColors[variant], className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge }
