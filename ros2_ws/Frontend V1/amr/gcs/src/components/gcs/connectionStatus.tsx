import { cn } from '@/lib/utils'

interface ConnectionStatusProps {
  connected: boolean
  connecting?: boolean
  error?: string | null
}

const STATUS_STYLES = {
  connected:   'bg-success text-success',
  connecting:  'bg-warning text-warning animate-pulse-slow',
  disconnected:'bg-error text-error',
  error:       'bg-error text-white',
} as const

export function ConnectionStatus({ connected, connecting = false, error }: ConnectionStatusProps) {
  let display = 'connected'
  if (error) display = 'error'
  else if (connecting || !connected) display = 'disconnected'

  const styles = STATUS_STYLES[display as keyof typeof STATUS_STYLES]
  const label = display === 'connected' ? 'ROS Connected' : display === 'connecting' ? 'Connecting...' : error || 'Disconnected'

  return (
    <span className={cn('inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold', styles)}>
      <span className="w-2 h-2 rounded-full bg-current" />
      {label}
    </span>
  )
}
