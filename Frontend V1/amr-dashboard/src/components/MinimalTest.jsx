import { useEffect, useState } from 'react';
import Header from './Header.jsx';
import GpsMapView from './GpsMapView.jsx';
import SlamView from './SlamView.jsx';
import useRosConnection from '../hooks/useRosConnection.js';
import useRobotMode from '../hooks/useRobotMode.js';

// Minimal test to see if basic components work
export default function MinimalTest() {
  const { status: connectionStatus } = useRosConnection();
  const { mode, isDefault } = useRobotMode();

  const [mainView, setMainView] = useState('auto');

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
      default:
        return <GpsMapView />;
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-deck-950 text-ink-high">
      <Header connectionStatus={connectionStatus} mode={mode} isModeDefault={isDefault} />

      <div className="flex min-h-0 flex-1 p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md panel shadow-panel">
          <div className="absolute left-3 top-3 z-[1000] rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] tracking-wider text-ink-mid">
            MAIN VIEW · {resolvedView.toUpperCase()}
          </div>
          {renderMain()}
        </div>
      </div>
    </div>
  );
}