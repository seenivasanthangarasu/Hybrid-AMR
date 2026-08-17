import { useEffect, useCallback } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { rosBridgeService } from '@/services/ros/connection'

export function useRosConnection() {
  const connect = useConnectionStore((s) => s.connect)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const isConnected = useConnectionStore((s) => s.isConnected)

  useEffect(() => {
    if (isConnected) return

    rosBridgeService.onStatusChange((status: string) => {
      if (status === 'connected') {
        connect()
      }
    })

    return () => {} // cleanup handled by disconnect
  }, [isConnected, connect])

  const startConnection = useCallback(async () => {
    await connect()
  }, [connect])

  const stopConnection = useCallback(() => {
    disconnect()
  }, [disconnect])

  return { isConnected, startConnection, stopConnection }
}
