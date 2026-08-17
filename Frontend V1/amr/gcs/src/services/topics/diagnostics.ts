/** Diagnostics service — handles /diagnostics topic subscription and parsing */

import { rosBridgeService } from '../ros/connection'
import type { DiagnosticEntry, DiagnosticLevel } from '@/types/diagnostics'

const LEVEL_MAP: Record<number, DiagnosticLevel> = { 0: 'ok', 1: 'warn', 2: 'error', 3: 'fatal' }

/** Subscribe to /diagnostics and parse into typed entries */
export function subscribeDiagnostics(callback: (entries: DiagnosticEntry[]) => void): () => void {
  const unsub = rosBridgeService.subscribe('/diagnostics', (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>
    const statusList = m['status'] as Array<Record<string, unknown>> | undefined
    if (!statusList) return

    const entries: DiagnosticEntry[] = statusList.map((s) => ({
      name: (s['name'] as string) ?? '',
      level: LEVEL_MAP[(s['level'] as number) ?? 0] ?? 'ok',
      message: (s['message'] as string) ?? '',
      values: {},
      timestamp: Date.now(),
    }))

    callback(entries)
  })

  return unsub.unsubscribe
}
