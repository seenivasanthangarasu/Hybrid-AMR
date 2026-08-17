import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import { useRosTelemetry } from '@/hooks/useRosTelemetry'

export default function AppLayout() {
  // Subscribe to ROS2 telemetry topics once at root level — all tabs get live data
  useRosTelemetry()
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bgSecondary">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 relative overflow-hidden">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
