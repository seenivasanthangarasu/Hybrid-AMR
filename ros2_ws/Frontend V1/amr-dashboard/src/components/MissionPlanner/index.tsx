import React, { useEffect, useRef, useState } from 'react';
import { useMission } from '../../context/MissionContext';
import { MapService } from './services/mapService';
import useMissionStore from './store/missionStore';
import WaypointEditor from './components/WaypointEditor';
import WaypointCard from './components/WaypointCard';

const MissionPlanner = () => {
  // Store references
  const mapRef = useRef<HTMLDivElement>(null);
  const mapServiceRef = useRef<MapService | null>(null);

  // Zustand store
  const {
    waypoints,
    selectedWaypointId,
    missionStatus,
    missionMode,
    isOptimizing,
    currentMission,
    executionState,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    selectWaypoint,
    clearWaypoints,
    setCurrentMission,
    updateMissionStatus,
    setMissionMode,
    startMissionExecution,
    pauseMissionExecution,
    resumeMissionExecution,
    stopMissionExecution,
    updateExecutionProgress
  } = useMissionStore();

  // Local state for UI
  const [newWaypointName, setNewWaypointName] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);

  const { destination, setDestination } = useMission();

  // Initialize map
  useEffect(() => {
    if (mapRef.current) {
      const mapService = MapService.getInstance();
      mapService.initializeMap(mapRef.current);
      mapServiceRef.current = mapService;

      // Add existing waypoints to the map
      waypoints.forEach(waypoint => {
        mapService.addWaypointMarker(waypoint, handleWaypointClick);
      });
    }

    // Clean up on unmount
    return () => {
      if (mapServiceRef.current) {
        mapServiceRef.current.clearAllMarkers();
      }
    };
  }, []);

  // Update map when waypoints change
  useEffect(() => {
    if (mapServiceRef.current) {
      mapServiceRef.current.clearAllMarkers();
      waypoints.forEach(waypoint => {
        mapServiceRef.current?.addWaypointMarker(waypoint, handleWaypointClick);
      });

      // Redraw mission path
      if (waypoints.length > 1) {
        mapServiceRef.current.drawMissionPath(waypoints);
      }
    }
  }, [waypoints]);

  // Handle waypoint click
  const handleWaypointClick = (waypoint: Waypoint) => {
    selectWaypoint(waypoint.id);
    setEditingWaypoint(waypoint);
    setShowEditor(true);
  };

  // Add a new waypoint at current destination
  const addWaypointAtCurrentLocation = () => {
    if (!destination.latitude || !destination.longitude) return;

    addWaypoint({
      name: `WP${waypoints.length + 1}`,
      latitude: parseFloat(destination.latitude),
      longitude: parseFloat(destination.longitude),
      heading: 0,
      speed: 0.5,
      arrivalRadius: 0.5,
      waitTime: 0,
      action: 'navigate',
      type: 'normal'
    });
  };

  // Add a new waypoint manually
  const addManualWaypoint = () => {
    if (!newWaypointName.trim() || !destination.latitude || !destination.longitude) return;

    addWaypoint({
      name: newWaypointName,
      latitude: parseFloat(destination.latitude),
      longitude: parseFloat(destination.longitude),
      heading: 0,
      speed: 0.5,
      arrivalRadius: 0.5,
      waitTime: 0,
      action: 'navigate',
      type: 'normal'
    });

    setNewWaypointName('');
  };

  // Update waypoint position on map
  const updateWaypointPosition = (id: string, lat: number, lng: number) => {
    if (mapServiceRef.current) {
      mapServiceRef.current.updateWaypointMarkerPosition(id, lat, lng);
    }
    updateWaypoint(id, { latitude: lat, longitude: lng });
  };

  // Handle waypoint edit save
  const handleEditSave = (updatedWaypoint: Waypoint) => {
    updateWaypoint(updatedWaypoint.id, updatedWaypoint);
    if (mapServiceRef.current) {
      mapServiceRef.current.updateWaypointMarkerPosition(
        updatedWaypoint.id,
        updatedWaypoint.latitude,
        updatedWaypoint.longitude
      );
    }
    setShowEditor(false);
    setEditingWaypoint(null);
  };

  // Handle waypoint edit cancel
  const handleEditCancel = () => {
    setShowEditor(false);
    setEditingWaypoint(null);
  };

  // Remove a waypoint
  const handleRemoveWaypoint = (id: string) => {
    removeWaypoint(id);
    if (mapServiceRef.current) {
      mapServiceRef.current.removeWaypointMarker(id);
    }
  };

  // Duplicate a waypoint
  const handleDuplicateWaypoint = (id: string) => {
    const waypointToDuplicate = waypoints.find(wp => wp.id === id);
    if (!waypointToDuplicate) return;

    const duplicated = {
      ...waypointToDuplicate,
      id: Math.random().toString(36).substr(2, 9),
      name: `${waypointToDuplicate.name} Copy`,
      timestamp: Date.now()
    };

    addWaypoint({
      name: duplicated.name,
      latitude: duplicated.latitude,
      longitude: duplicated.longitude,
      heading: duplicated.heading,
      speed: duplicated.speed,
      arrivalRadius: duplicated.arrivalRadius,
      waitTime: duplicated.waitTime,
      action: duplicated.action,
      type: duplicated.type
    });
  };

  // Start mission execution
  const handleStartMission = () => {
    if (waypoints.length === 0) return;

    startMissionExecution();
    updateMissionStatus('executing');
  };

  // Toggle mission pause/resume
  const toggleMissionPause = () => {
    if (missionStatus === 'executing') {
      pauseMissionExecution();
      updateMissionStatus('paused');
    } else if (missionStatus === 'paused') {
      resumeMissionExecution();
      updateMissionStatus('executing');
    }
  };

  // Cancel mission
  const handleCancelMission = () => {
    stopMissionExecution();
    updateMissionStatus('ready');
  };

  // Optimize route
  const handleOptimizeRoute = () => {
    if (waypoints.length < 3) return;

    // Simple optimization - sort waypoints by distance from first point
    const sorted = [...waypoints].sort((a, b) => {
      const first = waypoints[0];
      const distA = Math.sqrt(
        Math.pow(a.latitude - first.latitude, 2) +
        Math.pow(a.longitude - first.longitude, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.latitude - first.latitude, 2) +
        Math.pow(b.longitude - first.longitude, 2)
      );
      return distA - distB;
    });

    // Update waypoints in order (this would need to be handled by a proper store update)
    console.log('Optimized waypoints:', sorted);
  };

  // Reverse the route
  const handleReverseRoute = () => {
    // This would reverse the waypoints array and update the map
    console.log('Reversing route');
  };

  // Clear mission
  const handleClearMission = () => {
    clearWaypoints();
    if (mapServiceRef.current) {
      mapServiceRef.current.clearAllMarkers();
    }
  };

  // Import waypoints from JSON
  const handleImport = () => {
    if (!importJson.trim()) return;

    try {
      const parsed = JSON.parse(importJson);
      if (Array.isArray(parsed)) {
        parsed.forEach(waypoint => {
          addWaypoint({
            name: waypoint.name || `WP${waypoints.length + 1}`,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            heading: waypoint.heading || 0,
            speed: waypoint.speed || 0.5,
            arrivalRadius: waypoint.arrivalRadius || 0.5,
            waitTime: waypoint.waitTime || 0,
            action: waypoint.action || 'navigate',
            type: waypoint.type || 'normal'
          });
        });
        setShowImportModal(false);
        setImportJson('');
      }
    } catch (e) {
      console.error('Failed to import waypoints:', e);
    }
  };

  // Export waypoints to JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(waypoints, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `mission-waypoints-${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Calculate mission statistics
  const calculateMissionStats = () => {
    if (waypoints.length < 2) return { distance: 0, eta: 0 };

    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const wp1 = waypoints[i];
      const wp2 = waypoints[i + 1];

      // Simplified distance calculation
      const latDiff = wp2.latitude - wp1.latitude;
      const lonDiff = wp2.longitude - wp1.longitude;
      totalDistance += Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Approximate meters per degree
    }

    // Assume average speed of 1 m/s for ETA calculation
    const etaSeconds = totalDistance;
    return {
      distance: Math.round(totalDistance),
      eta: Math.round(etaSeconds / 60) // in minutes
    };
  };

  const missionStats = calculateMissionStats();

  return (
    <div className="panel rounded-lg p-3 shadow-panel h-full flex flex-col">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-ink-mid uppercase">
          MISSION PLANNER
        </h3>

        <div className="flex items-center space-x-2">
          {/* Mission Mode Selector */}
          <div className="flex items-center bg-deck-800/50 rounded-lg px-2 py-1">
            <span className="text-xs mr-1">Mode:</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setMissionMode('indoor')}
                className={`px-2 py-0.5 rounded text-xs ${
                  missionMode === 'indoor'
                    ? 'bg-green-500/20 text-green-400 border border-green-400/50'
                    : 'text-ink-low hover:bg-deck-700/50'
                }`}
              >
                Indoor
              </button>
              <button
                onClick={() => setMissionMode('outdoor')}
                className={`px-2 py-0.5 rounded text-xs ${
                  missionMode === 'outdoor'
                    ? 'bg-green-500/20 text-green-400 border border-green-400/50'
                    : 'text-ink-low hover:bg-deck-700/50'
                }`}
              >
                Outdoor
              </button>
              <button
                onClick={() => setMissionMode('hybrid')}
                className={`px-2 py-0.5 rounded text-xs ${
                  missionMode === 'hybrid'
                    ? 'bg-green-500/20 text-green-400 border border-green-400/50'
                    : 'text-ink-low hover:bg-deck-700/50'
                }`}
              >
                Hybrid
              </button>
            </div>
          </div>

          {/* Mission Status */}
          <div className="px-2 py-0.5 rounded-lg bg-deck-800/50 text-xs">
            {missionStatus === 'executing' ? (
              <span className="text-success">EXECUTING</span>
            ) : missionStatus === 'paused' ? (
              <span className="text-warning">PAUSED</span>
            ) : missionStatus === 'completed' ? (
              <span className="text-green-400">COMPLETED</span>
            ) : missionStatus === 'failed' ? (
              <span className="text-danger">FAILED</span>
            ) : (
              <span className="text-ink-low">READY</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Controls */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mb-2">
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
        >
          New
        </button>
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
        >
          Save
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
        >
          Export
        </button>
        <button
          onClick={handleOptimizeRoute}
          disabled={isOptimizing || waypoints.length < 3}
          className={`px-2 py-1 rounded transition-colors text-xs ${
            isOptimizing
              ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
              : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
          }`}
        >
          {isOptimizing ? 'OPT...' : 'Optimize'}
        </button>
        <button
          onClick={handleReverseRoute}
          className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors text-xs"
        >
          Reverse
        </button>
        <button
          onClick={handleClearMission}
          className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-xs"
        >
          Clear
        </button>
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors text-xs"
        >
          Save As
        </button>
      </div>

      {/* Mission Execution Controls */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <button
          onClick={handleStartMission}
          disabled={waypoints.length === 0 || missionStatus === 'executing'}
          className="px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors text-xs disabled:opacity-50"
        >
          Start
        </button>
        <button
          onClick={toggleMissionPause}
          disabled={missionStatus !== 'executing' && missionStatus !== 'paused'}
          className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors text-xs disabled:opacity-50"
        >
          {missionStatus === 'executing' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={handleCancelMission}
          disabled={missionStatus !== 'executing' && missionStatus !== 'paused'}
          className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-xs disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {}}
          className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors text-xs"
        >
          Home
        </button>
      </div>

      <div className="flex flex-1 gap-2">
        {/* Left Panel - Waypoint Management */}
        <div className="w-1/4 flex flex-col gap-2">
          {/* Add Waypoint Section */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">Add Waypoint</h4>
            <div className="mb-1">
              <input
                value={newWaypointName}
                onChange={(e) => setNewWaypointName(e.target.value)}
                placeholder="Waypoint name"
                className="w-full mb-1 rounded border border-deck-line bg-deck-900 px-2 py-1 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={addWaypointAtCurrentLocation}
                className="py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
              >
                Current
              </button>
              <button
                onClick={addManualWaypoint}
                className="py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
              >
                Manual
              </button>
            </div>
          </div>

          {/* Mission Statistics */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">Mission Stats</h4>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="bg-deck-900/50 p-1 rounded">
                <div className="text-ink-low">Waypoints</div>
                <div className="font-bold">{waypoints.length}</div>
              </div>
              <div className="bg-deck-900/50 p-1 rounded">
                <div className="text-ink-low">Distance</div>
                <div className="font-bold">{missionStats.distance} m</div>
              </div>
              <div className="bg-deck-900/50 p-1 rounded">
                <div className="text-ink-low">ETA</div>
                <div className="font-bold">{missionStats.eta} min</div>
              </div>
              <div className="bg-deck-900/50 p-1 rounded">
                <div className="text-ink-low">Progress</div>
                <div className="font-bold">{executionState.missionProgress}%</div>
              </div>
            </div>
          </div>

          {/* Waypoint List */}
          <div className="bg-deck-800/50 rounded p-2 flex-1">
            <h4 className="font-bold text-xs mb-1">Waypoints ({waypoints.length})</h4>
            <div className="max-h-32 overflow-y-auto">
              {waypoints.length === 0 ? (
                <div className="text-center py-2 text-ink-low text-xs">
                  No waypoints
                </div>
              ) : (
                waypoints.map((waypoint) => (
                  <WaypointCard
                    key={waypoint.id}
                    waypoint={waypoint}
                    isSelected={selectedWaypointId === waypoint.id}
                    onClick={() => handleWaypointClick(waypoint)}
                    onDuplicate={handleDuplicateWaypoint}
                    onDelete={handleRemoveWaypoint}
                  />
                ))
              )}
            </div>
          </div>

          {/* Mission Queue */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">Mission Queue</h4>
            <div className="space-y-1 text-xs">
              <div className="p-1 bg-deck-900/50 rounded flex justify-between items-center">
                <span>Next Mission</span>
                <span className="text-success">Scheduled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Panel - Interactive Map */}
        <div className="w-2/4 flex flex-col gap-2">
          <div
            ref={mapRef}
            className="w-full h-full rounded-lg border border-deck-line bg-deck-900"
            style={{ height: '500px' }}
          />
        </div>

        {/* Right Panel - Mission Info */}
        <div className="w-1/4 flex flex-col gap-2">
          {/* Mission Execution Panel */}
          <div className="bg-deck-800/50 rounded p-2 flex-1">
            <h4 className="font-bold text-xs mb-1">Mission Execution</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Current Waypoint:</span>
                <span className="font-medium">{executionState.currentWaypointIndex + 1}/{waypoints.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Robot Speed:</span>
                <span className="font-medium">0.5 m/s</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Distance:</span>
                <span className="font-medium">120 m</span>
              </div>
              <div className="flex justify-between">
                <span>Localization:</span>
                <span className="text-success">GPS OK</span>
              </div>
              <div className="flex justify-between">
                <span>RTK Status:</span>
                <span className="text-warning">Weak</span>
              </div>
            </div>
          </div>

          {/* Mission Progress */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">Mission Progress</h4>
            <div className="w-full bg-deck-900 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${executionState.missionProgress}%` }}
              ></div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">System Status</h4>
            <div className="flex justify-between text-xs">
              <span>GPS: <span className="text-success">Connected</span></span>
              <span>RTK: <span className="text-warning">Weak</span></span>
              <span>ROS: <span className="text-success">Connected</span></span>
            </div>
          </div>

          {/* Mission Info */}
          <div className="bg-deck-800/50 rounded p-2">
            <h4 className="font-bold text-xs mb-1">Mission Info</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="font-medium">{missionMode}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-medium">
                  {missionStatus === 'executing' ? 'Executing' :
                   missionStatus === 'paused' ? 'Paused' :
                   missionStatus === 'completed' ? 'Completed' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Waypoint Editor Modal */}
      {showEditor && editingWaypoint && (
        <WaypointEditor
          waypoint={editingWaypoint}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-deck-900 rounded-lg p-6 w-full max-w-md">
            <h4 className="font-bold mb-3">Import Waypoints</h4>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste JSON here..."
              className="w-full h-40 p-3 bg-deck-800 border border-deck-line rounded text-sm font-mono"
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionPlanner;