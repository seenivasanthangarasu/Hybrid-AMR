/** Mission Planner module — full mission planning workspace */
import { useState } from 'react'
import { MapBase } from './MapBase'
import { ControlPanel } from './ControlPanel'
import { WaypointList } from './WaypointList'

/** Main Mission Planner workspace with map + sidebar list */
export default function MissionPlanner() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="w-full h-full flex">
      {sidebarOpen && (
        <aside className="w-72 border-r bg-white overflow-auto flex-shrink-0">
          <WaypointList />
        </aside>
      )}
      <div className="flex-1 relative">
        <MapBase />
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-lg border shadow-card p-2 hover:bg-bg-secondary">
          {sidebarOpen ? '◀' : '▶'}
        </button>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
          <ControlPanel />
        </div>
      </div>
    </div>
  )
}
