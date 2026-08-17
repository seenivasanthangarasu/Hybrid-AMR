/** Diagnostics module — ROS2 diagnostic tree viewer */
import { useState } from 'react'
import { Input } from '@/components/ui'

export default function DiagnosticsModule() {
  const [search, setSearch] = useState('')

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search diagnostics..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <button className="btn-gcs bg-bg-secondary text-text-primary hover:bg-bg-tertiary border border-border text-sm">Download CSV</button>
        <button className="btn-gcs bg-bg-secondary text-text-primary hover:bg-bg-tertiary border border-border text-sm">Clear</button>
      </div>
      <div className="overflow-auto rounded-xl border card-gcs">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary border-b">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-text-secondary">Name</th>
              <th className="text-left px-4 py-2 font-semibold text-text-secondary">Level</th>
              <th className="text-left px-4 py-2 font-semibold text-text-secondary">Message</th>
              <th className="text-left px-4 py-2 font-semibold text-text-secondary">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={4} className="text-center py-8 text-text-muted">Waiting for diagnostic data...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
