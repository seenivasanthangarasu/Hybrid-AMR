/** Diagnostics types — used by the Diagnostics module */

export type DiagnosticLevel = 'ok' | 'warn' | 'error' | 'fatal'

export const DIAGNOSTIC_LEVELS: Record<DiagnosticLevel, number> = {
  ok: 0,
  warn: 1,
  error: 2,
  fatal: 3,
} as const

export interface DiagnosticEntry {
  name: string
  level: DiagnosticLevel
  message: string
  values: Record<string, string>
  /** Timestamp when the status was recorded (ms) */
  timestamp: number
  /** Parent node path for tree view grouping */
  parentPath?: string
}

/** Group diagnostics entries by their namespace path */
export function groupDiagnostics(entries: DiagnosticEntry[]): Map<string, DiagnosticEntry[]> {
  const groups = new Map<string, DiagnosticEntry[]>()
  for (const entry of entries) {
    const ns = entry.name.split('/').slice(0, -1).join('/') || 'root'
    if (!groups.has(ns)) groups.set(ns, [])
    groups.get(ns)!.push(entry)
  }
  return groups
}
