import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import ErrorBoundary from './components/ErrorBoundary.jsx';
import DashboardGrid from './components/DashboardGrid.jsx';
import PanelFrame from './components/ui/PanelFrame.jsx';
import ErrorDialog from './components/ErrorDialog.jsx';
import ErrorReference from './components/ErrorReference.jsx';
import useRosConnection from './hooks/useRosConnection.js';
import useRobotMode from './hooks/useRobotMode.js';
import useLayout from './hooks/useLayout.js';
import useGps from './hooks/useGps.js';
import useLaserScan from './hooks/useLaserScan.js';
import useOccupancyGrid from './hooks/useOccupancyGrid.js';
import { diagnoseView } from './errors/catalog.js';

// Main-view selection: 'auto' follows robot mode (GPS for OUTDOOR, SLAM for
// INDOOR per spec); operator can override by clicking a preview panel.
export default function App() {
  const { status: connectionStatus, reconnect } = useRosConnection();
  const { mode, isDefault } = useRobotMode();

  const [mainView, setMainView] = useState('auto'); // 'auto' | 'gps' | 'lidar' | 'camera'
  const [editMode, setEditMode] = useState(false);
  const { layout, setLayout, reset } = useLayout();

  const [fault, setFault] = useState(null); // { error, context } — explains an empty view
  const [showErrorRef, setShowErrorRef] = useState(false);
  const [cameraOnline, setCameraOnline] = useState(true);

  // These subscriptions are shared with the panels themselves (RosConnection
  // caches one ROSLIB.Topic per name), so reading them here to decide whether a
  // view has anything to show costs no extra traffic.
  const gps = useGps();
  const scan = useLaserScan();
  const map = useOccupancyGrid();

  // Is the view the operator just picked actually able to draw anything?
  const viewHealth = {
    gps: { live: gps.hasData, seen: gps.hasEverData, label: 'GPS · /fix' },
    lidar: { live: scan.hasData, seen: scan.hasEverData, label: 'LIDAR · /scan' },
    slam: { live: map.hasData, seen: map.hasEverData, label: 'SLAM · /map' },
    camera: { live: cameraOnline, seen: cameraOnline, label: 'CAMERA · MJPEG stream', isCamera: true },
  };

  // A manual pin now SURVIVES a robot-mode change (spec F5). When the view is
  // on 'auto' it already tracks `mode` reactively via `resolvedView` below, so
  // no reset is needed; when the operator has pinned a specific view, a mode
  // flip (e.g. INDOOR→OUTDOOR once /robot_mode is published) must not yank
  // their chosen view away. The operator clears the pin by clicking the
  // already-active preview, or it falls back to auto on reload.
  const resolvedView = mainView === 'auto' ? (mode === 'INDOOR' ? 'slam' : 'gps') : mainView;

  // While editing the layout, a preview click should not switch the main view
  // (the drag scrim also shields it) — panels are being arranged, not driven.
  //
  // Selecting a view that has nothing to draw used to just swap in an empty
  // panel, leaving the operator to guess whether the sensor was dead, the link
  // was down, or they had mis-clicked. The view still switches (so the inline
  // fallback is visible), but a dialog now names the specific cause and the
  // steps to fix it.
  function selectView(v) {
    if (editMode) return;
    setMainView(v);

    const health = viewHealth[v];
    if (health && !health.live) {
      setFault({
        error: diagnoseView({
          connectionStatus,
          hasEverData: health.seen,
          isCamera: health.isCamera,
        }),
        context: health.label,
      });
    }
  }

  function renderMain() {
    switch (resolvedView) {
      case 'gps':
        return <GpsMapView />;
      case 'slam':
        return <SlamView />;
      case 'lidar':
        return <LidarView />;
      case 'camera':
        return <CameraView onStreamState={setCameraOnline} />;
      default:
        return <GpsMapView />;
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-deck-950 text-ink-high">
      <Header
        connectionStatus={connectionStatus}
        mode={mode}
        isModeDefault={isDefault}
        onReconnect={reconnect}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
        onResetLayout={reset}
        onOpenErrorReference={() => setShowErrorRef(true)}
      />

      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between gap-3 overflow-hidden border-b border-signal-cyan/30 bg-signal-cyan/10 px-4"
          >
            <span className="flex items-center gap-2 py-1.5 font-mono text-[11px] tracking-wider text-signal-cyan">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-slow rounded-full bg-signal-cyan" />
              LAYOUT EDIT MODE — drag any panel to move · drag its bottom-right corner to resize
            </span>
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="rounded bg-signal-cyan/20 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-signal-cyan transition-colors hover:bg-signal-cyan/30"
            >
              DONE
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1 p-3">
        <DashboardGrid layout={layout} onLayoutChange={setLayout} editMode={editMode}>
          {/* MAIN VIEW */}
          <div key="main" className="h-full w-full">
            <PanelFrame title="MAIN VIEW" editMode={editMode}>
              <div className="relative h-full w-full overflow-hidden rounded-md panel shadow-panel">
                <div className="absolute left-3 top-3 z-[400] rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] tracking-wider text-ink-mid">
                  MAIN VIEW · {resolvedView.toUpperCase()}
                  {mode === 'INDOOR' && resolvedView === 'slam' && ' (SLAM)'}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={resolvedView}
                    initial={{ opacity: 0, scale: 1.01 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="h-full w-full"
                  >
                    <ErrorBoundary label={resolvedView.toUpperCase()}>{renderMain()}</ErrorBoundary>
                  </motion.div>
                </AnimatePresence>
              </div>
            </PanelFrame>
          </div>

          {/* TELEMETRY / CONTROLS */}
          <div key="status" className="h-full w-full">
            <PanelFrame title="STATUS" editMode={editMode}>
              <ErrorBoundary label="STATUS">
                <StatusPanel mode={mode} connectionStatus={connectionStatus} />
              </ErrorBoundary>
            </PanelFrame>
          </div>

          <div key="mission" className="h-full w-full">
            <PanelFrame title="MISSION PLANNER" editMode={editMode}>
              <ErrorBoundary label="MISSION PLANNER">
                <MissionPlanner connectionStatus={connectionStatus} />
              </ErrorBoundary>
            </PanelFrame>
          </div>

          <div key="control" className="h-full w-full">
            <PanelFrame title="CONTROL PANEL" editMode={editMode}>
              <ErrorBoundary label="CONTROL PANEL">
                <ControlPanel connectionStatus={connectionStatus} />
              </ErrorBoundary>
            </PanelFrame>
          </div>

          {/* PREVIEWS */}
          <div key="gps" className="h-full w-full">
            <PanelFrame title="GPS PREVIEW" editMode={editMode}>
              <PreviewPanel
                title="GPS PREVIEW"
                active={resolvedView === 'gps'}
                onClick={() => selectView('gps')}
              >
                <ErrorBoundary label="GPS PREVIEW">
                  <GpsMapView compact />
                </ErrorBoundary>
              </PreviewPanel>
            </PanelFrame>
          </div>

          <div key="lidar" className="h-full w-full">
            <PanelFrame title="LIDAR PREVIEW" editMode={editMode}>
              <PreviewPanel
                title="LIDAR PREVIEW"
                active={resolvedView === 'lidar'}
                onClick={() => selectView('lidar')}
              >
                <ErrorBoundary label="LIDAR PREVIEW">
                  <LidarView compact />
                </ErrorBoundary>
              </PreviewPanel>
            </PanelFrame>
          </div>

          <div key="camera" className="h-full w-full">
            <PanelFrame title="DEPTH CAMERA PREVIEW" editMode={editMode}>
              <PreviewPanel
                title="DEPTH CAMERA PREVIEW"
                active={resolvedView === 'camera'}
                onClick={() => selectView('camera')}
              >
                <ErrorBoundary label="CAMERA PREVIEW">
                  <CameraView compact onStreamState={setCameraOnline} />
                </ErrorBoundary>
              </PreviewPanel>
            </PanelFrame>
          </div>

          <div key="urdf" className="h-full w-full">
            <PanelFrame title="URDF ROBOT WIDGET" editMode={editMode}>
              <PreviewPanel title="URDF ROBOT WIDGET" interactive={false}>
                <ErrorBoundary label="URDF WIDGET">
                  <UrdfWidget />
                </ErrorBoundary>
              </PreviewPanel>
            </PanelFrame>
          </div>
        </DashboardGrid>
      </div>

      {/* Explains an empty view the operator just selected. Link faults get a
          RECONNECT action inline so the fix is one click from the explanation. */}
      <ErrorDialog
        error={fault?.error}
        open={!!fault}
        onClose={() => setFault(null)}
        context={fault?.context}
        actions={
          fault?.error?.category === 'LINK' && connectionStatus !== 'connected' ? (
            <button
              type="button"
              onClick={() => {
                reconnect();
                setFault(null);
              }}
              className="rounded bg-signal-cyan/15 px-3 py-1.5 font-display text-[11px] font-bold tracking-wider text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25"
            >
              RECONNECT
            </button>
          ) : null
        }
      />

      <ErrorReference open={showErrorRef} onClose={() => setShowErrorRef(false)} />
    </div>
  );
}
