import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App.jsx';
import * as WorkspaceContextModule from './context/WorkspaceContext.jsx';
import * as useRosConnectionModule from './hooks/useRosConnection.js';
import * as useRobotModeModule from './hooks/useRobotMode.js';

vi.mock('./components/GpsMapView.jsx', () => ({
  default: () => <div data-testid="gps-map-view">GPS MAP VIEW</div>,
}));

vi.mock('./components/SlamView.jsx', () => ({
  default: () => <div data-testid="slam-view">SLAM VIEW</div>,
}));

vi.mock('./components/LidarView.jsx', () => ({
  default: () => <div data-testid="lidar-view">LIDAR VIEW</div>,
}));

vi.mock('./components/CameraView.jsx', () => ({
  default: () => <div data-testid="camera-view">CAMERA VIEW</div>,
}));

vi.mock('./components/UrdfWidget.jsx', () => ({
  default: () => <div data-testid="urdf-widget">URDF WIDGET</div>,
}));

vi.mock('./components/StatusPanel.jsx', () => ({
  default: () => <div data-testid="status-panel">STATUS PANEL</div>,
}));

vi.mock('./components/ControlPanel.jsx', () => ({
  default: () => <div data-testid="control-panel">CONTROL PANEL</div>,
}));

vi.mock('./components/MissionPlanner.jsx', () => ({
  default: () => <div data-testid="mission-planner">MISSION PLANNER</div>,
}));

vi.mock('./components/navigation/IndoorNavGate.jsx', () => ({
  default: ({ children }) => <div data-testid="indoor-nav-gate">{children}</div>,
}));

vi.mock('./components/navigation/IndoorNavPlanner.jsx', () => ({
  default: () => <div data-testid="indoor-nav-planner">INDOOR NAV PLANNER</div>,
}));

vi.mock('./components/mapping/IndoorMappingWorkspace.jsx', () => ({
  default: () => <div data-testid="indoor-mapping-workspace">INDOOR MAPPING WORKSPACE</div>,
}));

describe('App environment-aware dynamic views and panel filtering', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(useRosConnectionModule, 'default').mockReturnValue({
      status: 'connected',
      retry: { attempt: 0, exhausted: false },
      reconnect: vi.fn(),
    });
    vi.spyOn(useRobotModeModule, 'default').mockReturnValue({
      mode: 'INDOOR',
      isDefault: false,
      isTopicLive: true,
    });
  });

  it('unmounts GPS preview and mounts IndoorNavGate in indoor navigation mode', () => {
    vi.spyOn(WorkspaceContextModule, 'useWorkspace').mockReturnValue({
      environment: 'indoor',
      operatingMode: 'navigation',
      activeSegment: 'indoor',
      effectiveEnvironment: 'indoor',
      selectedMap: { map_id: 'test-map' },
      mapActivation: { status: 'ready' },
      setOperatingMode: vi.fn(),
    });

    render(<App />);

    // In indoor mode, GPS preview is unmounted
    expect(screen.queryByText('GPS PREVIEW')).toBeNull();

    // Indoor Nav Gate and Indoor Nav Planner are mounted in mission panel
    expect(screen.getByTestId('indoor-nav-gate')).toBeInTheDocument();
    expect(screen.getByTestId('indoor-nav-planner')).toBeInTheDocument();
    expect(screen.queryByTestId('mission-planner')).toBeNull();
  });

  it('mounts GPS preview and MissionPlanner in outdoor navigation mode', () => {
    vi.spyOn(WorkspaceContextModule, 'useWorkspace').mockReturnValue({
      environment: 'outdoor',
      operatingMode: 'navigation',
      activeSegment: 'outdoor',
      effectiveEnvironment: 'outdoor',
      selectedMap: null,
      mapActivation: { status: 'unselected' },
      setOperatingMode: vi.fn(),
    });

    render(<App />);

    // In outdoor mode, GPS preview is present
    expect(screen.getByText('GPS PREVIEW')).toBeInTheDocument();

    // MissionPlanner is mounted
    expect(screen.getByTestId('mission-planner')).toBeInTheDocument();
    expect(screen.queryByTestId('indoor-nav-gate')).toBeNull();
  });

  it('renders IndoorMappingWorkspace in Main View when operating in mapping mode', () => {
    vi.spyOn(WorkspaceContextModule, 'useWorkspace').mockReturnValue({
      environment: 'indoor',
      operatingMode: 'mapping',
      activeSegment: 'indoor',
      effectiveEnvironment: 'indoor',
      selectedMap: null,
      mapActivation: { status: 'unselected' },
      setOperatingMode: vi.fn(),
    });

    render(<App />);

    expect(screen.getByTestId('indoor-mapping-workspace')).toBeInTheDocument();
    expect(screen.getByText('MAPPING MODE ACTIVE')).toBeInTheDocument();
  });
});
