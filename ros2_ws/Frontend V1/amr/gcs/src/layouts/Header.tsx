import { useConnectionStore } from '@/stores/connectionStore'
import { ConnectionStatus } from '@/components/gcs/connectionStatus'

export default function Header() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  const isConnecting = useConnectionStore((s) => s.isConnecting)
  const connectionError = useConnectionStore((s) => s.connectionError)

  return (
    <header className="h-[var(--header-height)] flex items-center justify-between px-4 border-b border-border bg-white z-20">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-text-primary">Hybrid AMR</h1>
        <span className="text-xs text-text-muted font-medium">Ground Control Station</span>
      </div>
      <div className="flex items-center gap-3">
        <ConnectionStatus connected={isConnected} connecting={isConnecting} error={connectionError} />
        <span className="text-sm text-text-secondary font-medium">v0.1.0</span>
      </div>
    </header>
  )
}
