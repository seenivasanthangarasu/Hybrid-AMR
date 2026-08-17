import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import GpsMapView from './components/GpsMapView.jsx';
import LidarView from './components/LidarView.jsx';
import SlamView from './components/SlamView.jsx';
import CameraView from './components/CameraView.jsx';
import UrdfWidget from './components/UrdfWidget.jsx';
import PreviewPanel from './components/PreviewPanel.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import MissionPlanner from './components/MissionPlanner.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import useRosConnection from './hooks/useRosConnection.js';
import useRobotMode from './hooks/useRobotMode.js';

// Main-view selection: 'auto' follows robot mode (GPS for OUTDOOR, SLAM for
// INDOOR per spec); operator can override by clicking a preview panel.
export default function App() {
  const { status: connectionStatus } = useRosConnection();
  const { mode, isDefault } = useRobotMode();

  const [mainView, setMainView] = useState('auto'); // 'auto' | 'gps' | 'lidar' | 'camera'

  // Whenever robot mode changes, drop any manual override back to auto
  // so the main view always reflects the robot's actual operating mode
  // unless the operator explicitly pinned a preview.
  useEffect(() => {
    setMainView('auto');
  }, [mode]);

  const resolvedView =
    mainView === 'auto' ? (mode === 'INDOOR' ? 'slam' : 'gps') : mainView;

  function renderMain() {
    switch (resolvedView) {
      case 'gps':
        return <GpsMapView />;
      case 'slam':
        return <SlamView />;
      case 'lidar':
        return <LidarView />;
      case 'camera':
        return <CameraView />;
      default:
        return <GpsMapView />;
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-deck-950 text-ink-high">
      <Header connectionStatus={connectionStatus} mode={mode} isModeDefault={isDefault} />

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3 p-3">
        {/* MAIN VIEW AREA */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-md panel shadow-panel">
            <div className="absolute left-3 top-3 z-[1000] rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] tracking-wider text-ink-mid">
              MAIN VIEW · {resolvedView.toUpperCase()}
              {mode === 'INDOOR' && resolvedView === 'slam' && ' (SLAM)'}
            </div>
            {renderMain()}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatusPanel mode={mode} connectionStatus={connectionStatus} />
            <MissionPlanner />
            <ControlPanel />
          </div>
        </div>

        {/* RIGHT SIDE PANELS */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          <PreviewPanel
  title="GPS PREVIEW"
  active={resolvedView === 'gps'}
  onClick={() => setMainView('gps')}
>
  <GpsMapView compact />
</PreviewPanel>

          <PreviewPanel title="LIDAR PREVIEW" active={resolvedView === 'lidar'} onClick={() => setMainView('lidar')}>
            <LidarView compact />
          </PreviewPanel>

          <PreviewPanel title="DEPTH CAMERA PREVIEW" active={resolvedView === 'camera'} onClick={() => setMainView('camera')}>
            <CameraView compact />
          </PreviewPanel>

          <PreviewPanel title="URDF ROBOT WIDGET" active={false} onClick={() => {}}>
            <UrdfWidget />
          </PreviewPanel>
        </div>
      </div>
    </div>
  );
}
