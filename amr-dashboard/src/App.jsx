import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import WorkspaceStatus from './components/WorkspaceStatus.jsx';
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
import DataHandlingPage from './components/DataHandlingPage.jsx';
import GnssQualityPage from './components/GnssQualityPage.jsx';
import Nav2ThresholdPage from './components/Nav2ThresholdPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import ImuPanel from './components/ImuPanel.jsx';
import IndoorMapPicker from './components/maps/IndoorMapPicker.jsx';
import IndoorMappingWorkspace from './components/mapping/IndoorMappingWorkspace.jsx';
import IndoorNavGate from './components/navigation/IndoorNavGate.jsx';
import IndoorNavPlanner from './components/navigation/IndoorNavPlanner.jsx';
import { useWorkspace } from './context/WorkspaceContext.jsx';
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
  const { status: connectionStatus, retry, reconnect } = useRosConnection();
  // An automatic attempt is pending — used to explain a dead link as "retrying"
  // rather than sending the operator off to restart rosbridge unnecessarily.
  const retrying = retry.attempt > 0 && !retry.exhausted;
  const { mode, isDefault } = useRobotMode();

  const {
    operatingMode,
    effectiveEnvironment,
    setOperatingMode,
  } = useWorkspace();

  const isIndoor = effectiveEnvironment === 'indoor';
  const { layout, setLayout, reset } = useLayout(effectiveEnvironment || 'outdoor');

  const [mainView, setMainView] = useState('auto'); // 'auto' | 'gps' | 'lidar' | 'camera'
  const [editMode, setEditMode] = useState(false);
  const [showSavedMaps, setShowSavedMaps] = useState(false);

  const [fault, setFault] = useState(null); // { error, context } — explains an empty view
  const [showSidebar, setShowSidebar] = useState(false);
  const [showErrorRef, setShowErrorRef] = useState(false);
  const [showDataHandling, setShowDataHandling] = useState(false);
  const [showGnssQuality, setShowGnssQuality] = useState(false);
  const [showNav2Threshold, setShowNav2Threshold] = useState(false);
  const [cameraOnline, setCameraOnline] = useState(true);

  // GPS subscription is disabled entirely when isIndoor is true (no GPS topics in indoor mode)
  const gps = useGps({ enabled: !isIndoor });
  const scan = useLaserScan();
  const map = useOccupancyGrid({ enabled: isIndoor });

  // Is the view the operator just picked actually able to draw anything?
  const viewHealth = {
    gps: { live: !isIndoor && gps.hasData, seen: !isIndoor && gps.hasEverData, label: 'GPS · /hiwonder/gps/fix' },
    lidar: { live: scan.hasData, seen: scan.hasEverData, label: 'LIDAR · /scan' },
    slam: { live: map.hasData, seen: map.hasEverData, label: 'SLAM · /map' },
    camera: { live: cameraOnline, seen: cameraOnline, label: 'CAMERA · /camera/color/image_raw (MJPEG)', isCamera: true },
  };

  const defaultMainView = isIndoor ? 'slam' : 'gps';
  const resolvedView =
    operatingMode === 'mapping'
      ? 'slam'
      : mainView === 'auto'
        ? defaultMainView
        : (isIndoor && mainView === 'gps' ? 'slam' : mainView);

  function selectView(v) {
    if (editMode) return;
    if (isIndoor && v === 'gps') return;
    setMainView(v);

    const health = viewHealth[v];
    if (health && !health.live) {
      setFault({
        error: diagnoseView({
          connectionStatus,
          hasEverData: health.seen,
          isCamera: health.isCamera,
          retrying,
        }),
        context: health.label,
      });
    }
  }

  function renderMain() {
    if (isIndoor && operatingMode === 'mapping') {
      return <IndoorMappingWorkspace onProceedToNavigation={() => setOperatingMode('navigation')} />;
    }
    switch (resolvedView) {
      case 'gps':
        return isIndoor ? <SlamView /> : <GpsMapView />;
      case 'slam':
        return <SlamView />;
      case 'lidar':
        return <LidarView />;
      case 'camera':
        return <CameraView onStreamState={setCameraOnline} />;
      default:
        return isIndoor ? <SlamView /> : <GpsMapView />;
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-deck-950 text-ink-high">
      <WorkspaceStatus />
      <Header
        connectionStatus={connectionStatus}
        mode={mode}
        isModeDefault={isDefault}
        onReconnect={reconnect}
        retry={retry}
        onOpenSidebar={() => setShowSidebar(true)}
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
            <PanelFrame
              title={
                operatingMode === 'mapping'
                  ? 'INDOOR MAPPING'
                  : isIndoor && operatingMode === 'navigation'
                    ? 'INDOOR NAVIGATION'
                    : 'MISSION PLANNER'
              }
              editMode={editMode}
            >
              <ErrorBoundary label="MISSION PLANNER">
                {operatingMode === 'mapping' ? (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center font-mono text-xs text-ink-mid bg-deck-950">
                    <p className="font-bold text-signal-cyan mb-1">MAPPING MODE ACTIVE</p>
                    <p className="text-ink-low max-w-xs">
                      Live SLAM rendering and map controls are active in the Main View panel.
                    </p>
                  </div>
                ) : isIndoor && operatingMode === 'navigation' ? (
                  <IndoorNavGate>
                    <IndoorNavPlanner connectionStatus={connectionStatus} />
                  </IndoorNavGate>
                ) : (
                  <MissionPlanner connectionStatus={connectionStatus} />
                )}
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

          <div key="imu" className="h-full w-full">
            <PanelFrame title="IMU" editMode={editMode}>
              <ErrorBoundary label="IMU">
                <ImuPanel />
              </ErrorBoundary>
            </PanelFrame>
          </div>

          {/* PREVIEWS */}
          {!isIndoor && (
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
          )}

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
            <PanelFrame title="LOGITECH C270 HD (720P)" editMode={editMode}>
              <PreviewPanel
                title="LOGITECH C270 HD (720P)"
                active={resolvedView === 'camera'}
                onClick={() => selectView('camera')}
              >
                <ErrorBoundary label="LOGITECH C270 CAMERA PREVIEW">
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
      <DataHandlingPage open={showDataHandling} onClose={() => setShowDataHandling(false)} />
      <GnssQualityPage open={showGnssQuality} onClose={() => setShowGnssQuality(false)} />
      <Nav2ThresholdPage
        open={showNav2Threshold}
        onClose={() => setShowNav2Threshold(false)}
        connectionStatus={connectionStatus}
      />

      <Sidebar
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
        onResetLayout={reset}
        onOpenGnssQuality={() => setShowGnssQuality(true)}
        onOpenNav2Threshold={() => setShowNav2Threshold(true)}
        onOpenDataHandling={() => setShowDataHandling(true)}
        onOpenErrorReference={() => setShowErrorRef(true)}
        onOpenSavedMaps={() => setShowSavedMaps(true)}
      />

      <IndoorMapPicker
        open={showSavedMaps}
        onClose={() => setShowSavedMaps(false)}
        onGoToMapping={() => {
          setShowSavedMaps(false);
          setOperatingMode('mapping');
        }}
      />
    </div>
  );
}
