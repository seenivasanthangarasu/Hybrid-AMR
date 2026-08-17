import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Map, Camera, ScanLine, Cpu, Activity, Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/mission', label: 'Mission Planner', icon: Map },
  { to: '/camera', label: 'Camera', icon: Camera },
  { to: '/lidar', label: 'LiDAR', icon: ScanLine },
  { to: '/robot', label: 'Robot', icon: Cpu },
  { to: '/diagnostics', label: 'Diagnostics', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export default function Sidebar() {
  return (
    <nav className="flex flex-col items-center w-18 bg-bgSecondary border-r border-border py-4 gap-2 z-30">
      <div className="mb-6 px-3">
        <span className="text-brand font-bold text-lg">GCS</span>
      </div>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (
            <div className={cn(
              'flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer w-14',
              isActive ? 'bg-brand/10 text-brand' : 'text-text-muted hover:text-text-secondary hover:bg-bgTertiary',
            )}>
              <Icon className="w-5 h-5" />
              <span className="leading-tight">{label}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
