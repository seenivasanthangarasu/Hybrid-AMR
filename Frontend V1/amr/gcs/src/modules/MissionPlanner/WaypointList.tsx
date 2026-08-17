/** Waypoint list panel — sidebar showing all waypoints with edit capabilities */
import { useMissionStore } from '@/stores/missionStore'

export function WaypointList() {
  const waypoints = useMissionStore((s) => s.waypoints)
  const addWaypoint = useMissionStore((s) => s.addWaypoint)
  const removeWaypoint = useMissionStore((s) => s.removeWaypoint)
  const updateWaypoint = useMissionStore((s) => s.updateWaypoint)
  const clearMission = useMissionStore((s) => s.clearMission)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b bg-bgSecondary">
        <h2 className="font-bold text-text-primary text-base">Waypoints ({waypoints.length})</h2>
        <button onClick={() => addWaypoint(0, 0)} className="mt-2 w-full touch-md bg-brand text-white rounded-lg font-semibold">
          + Add Waypoint
        </button>
      </div>

      {/* Waypoint items */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {waypoints.map((wp, i) => (
          <WaypointItem key={wp.id} waypoint={wp} index={i} onUpdate={(id, updates) => updateWaypoint(id, updates)} onRemove={removeWaypoint} />
        ))}

        {waypoints.length === 0 && (
          <div className="text-center text-text-muted py-8">
            <p className="text-sm">Click on the map</p>
            <p className="text-xs">to create a waypoint</p>
          </div>
        )}
      </div>

      {/* Footer with clear button */}
      {waypoints.length > 0 && (
        <div className="p-3 border-t">
          <button onClick={clearMission} className="w-full touch-md bg-error/10 text-error rounded-lg font-semibold hover:bg-error/20">
            Clear Mission
          </button>
        </div>
      )}
    </div>
  )
}

function WaypointItem({ waypoint, index, onUpdate, onRemove }: {
  waypoint: ReturnType<typeof useMissionStore.getState>['waypoints'][number]
  index: number
  onUpdate: (id: string, updates: Partial<ReturnType<typeof useMissionStore.getState>['waypoints'][number]>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border hover:bg-bgSecondary group">
      <span className="text-sm font-bold text-brand w-6">{index + 1}</span>
      <input
        value={waypoint.name}
        onChange={(e) => onUpdate(waypoint.id, { name: e.target.value })}
        className="flex-1 text-sm font-medium border-0 bg-transparent focus:outline-none"
      />
      <span className="text-xs text-text-muted">{Math.round(waypoint.lat * 1e6) / 1e6}, {Math.round(waypoint.lng * 1e6) / 1e6}</span>
      <button onClick={() => onRemove(waypoint.id)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 rounded p-1">✕</button>
    </div>
  )
}
