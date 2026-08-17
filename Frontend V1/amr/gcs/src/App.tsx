import { Routes, Route } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import Dashboard from './modules/Dashboard'
import MissionPlanner from './modules/MissionPlanner'
import CameraModule from './modules/Camera'
import LiDARModule from './modules/LiDAR'
import RobotModule from './modules/Robot'
import DiagnosticsModule from './modules/Diagnostics'
import SettingsModule from './modules/Settings'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="mission" element={<MissionPlanner />} />
        <Route path="camera" element={<CameraModule />} />
        <Route path="lidar" element={<LiDARModule />} />
        <Route path="robot" element={<RobotModule />} />
        <Route path="diagnostics" element={<DiagnosticsModule />} />
        <Route path="settings" element={<SettingsModule />} />
      </Route>
    </Routes>
  )
}

export default App
