import { useEffect, useState, useRef } from 'react';
import { useMission } from '../context/MissionContext.jsx';

// Utility functions for waypoint management
const generateUniqueId = () => Math.random().toString(36).substr(2, 9);

export default function MissionPlanner() {
  // State management
  const [waypoints, setWaypoints] = useState([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [missionStatus, setMissionStatus] = useState('READY'); // READY, RUNNING, PAUSED, COMPLETED, FAILED
  const [missionMode, setMissionMode] = useState('outdoor'); // indoor, outdoor, hybrid
  const [showWaypointEditor, setShowWaypointEditor] = useState(false);
  const [waypointToEdit, setWaypointToEdit] = useState(null);
  const [missionQueue, setMissionQueue] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);

  const { destination, setDestination } = useMission();

  // Load waypoints from localStorage on mount
  useEffect(() => {
    const savedWaypoints = localStorage.getItem('missionWaypoints');
    if (savedWaypoints) {
      try {
        setWaypoints(JSON.parse(savedWaypoints));
      } catch (e) {
        console.error('Failed to parse waypoints:', e);
      }
    }
  }, []);

  // Save waypoints to localStorage whenever they change
  useEffect(() => {
    if (waypoints.length > 0) {
      localStorage.setItem('missionWaypoints', JSON.stringify(waypoints));
    }
  }, [waypoints]);

  // Add a new waypoint at current destination
  const addWaypointAtCurrentLocation = () => {
    if (!destination.latitude || !destination.longitude) return;

    const newWaypoint = {
      id: generateUniqueId(),
      name: `WP${waypoints.length + 1}`,
      latitude: parseFloat(destination.latitude),
      longitude: parseFloat(destination.longitude),
      type: 'normal',
      timestamp: Date.now(),
      heading: 0,
      speed: 0.5,
      arrivalRadius: 0.5,
      waitTime: 0,
      action: 'navigate'
    };

    setWaypoints(prev => [...prev, newWaypoint]);
    setSelectedWaypoint(newWaypoint.id);
  };

  // Add a new waypoint manually
  const addManualWaypoint = () => {
    if (!newWaypointName.trim() || !destination.latitude || !destination.longitude) return;

    const newWaypoint = {
      id: generateUniqueId(),
      name: newWaypointName,
      latitude: parseFloat(destination.latitude),
      longitude: parseFloat(destination.longitude),
      type: 'normal',
      timestamp: Date.now(),
      heading: 0,
      speed: 0.5,
      arrivalRadius: 0.5,
      waitTime: 0,
      action: 'navigate'
    };

    setWaypoints(prev => [...prev, newWaypoint]);
    setNewWaypointName('');
    setSelectedWaypoint(newWaypoint.id);
  };

  // Remove a waypoint
  const removeWaypoint = (id) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id));
    if (selectedWaypoint === id) {
      setSelectedWaypoint(null);
      setShowWaypointEditor(false);
    }
  };

  // Duplicate a waypoint
  const duplicateWaypoint = (id) => {
    const waypointToDuplicate = waypoints.find(wp => wp.id === id);
    if (!waypointToDuplicate) return;

    const duplicated = {
      ...waypointToDuplicate,
      id: generateUniqueId(),
      name: `${waypointToDuplicate.name} Copy`,
      timestamp: Date.now()
    };

    setWaypoints(prev => [...prev, duplicated]);
  };

  // Rename a waypoint
  const renameWaypoint = (id, newName) => {
    setWaypoints(prev =>
      prev.map(wp =>
        wp.id === id ? { ...wp, name: newName } : wp
      )
    );
  };

  // Open waypoint editor
  const openWaypointEditor = (waypoint) => {
    setWaypointToEdit(waypoint);
    setShowWaypointEditor(true);
  };

  // Save waypoint changes
  const saveWaypointChanges = (updatedData) => {
    setWaypoints(prev =>
      prev.map(wp =>
        wp.id === updatedData.id ? { ...wp, ...updatedData } : wp
      )
    );
    setShowWaypointEditor(false);
    setWaypointToEdit(null);
  };

  // Start mission
  const startMission = () => {
    if (waypoints.length === 0) return;

    setMissionStatus('RUNNING');
    setCurrentWaypointIndex(0);
  };

  // Pause/resume mission
  const toggleMissionPause = () => {
    setMissionStatus(prev => prev === 'RUNNING' ? 'PAUSED' : 'RUNNING');
  };

  // Cancel mission
  const cancelMission = () => {
    setMissionStatus('READY');
    setCurrentWaypointIndex(0);
  };

  // Optimize route
  const optimizeRoute = () => {
    if (waypoints.length < 3) return;

    setIsOptimizing(true);

    // Simple optimization - sort waypoints by distance from first point
    setTimeout(() => {
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

      setWaypoints(sorted);
      setIsOptimizing(false);
    }, 500);
  };

  // Reverse the route
  const reverseRoute = () => {
    setWaypoints(prev => [...prev].reverse());
  };

  // Clear mission
  const clearMission = () => {
    setWaypoints([]);
    setSelectedWaypoint(null);
    setMissionStatus('READY');
    setCurrentWaypointIndex(0);
  };

  // Import waypoints from JSON
  const handleImport = () => {
    if (!importJson.trim()) return;

    try {
      const parsed = JSON.parse(importJson);
      if (Array.isArray(parsed)) {
        setWaypoints(prev => [...prev, ...parsed]);
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
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

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

  // Render waypoint list item with improved styling
  const renderWaypointItem = (waypoint, index) => (
    <div
      key={waypoint.id}
      className={`p-3 mb-2 rounded-lg cursor-pointer transition-all duration-200 ${
        selectedWaypoint === waypoint.id
          ? 'bg-blue-500/20 border-2 border-blue-400'
          : 'bg-deck-800/50 hover:bg-deck-700/50'
      }`}
      onClick={() => setSelectedWaypoint(waypoint.id)}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="font-bold text-sm">{waypoint.name}</div>
          <div className="text-xs text-ink-low mt-1">
            {waypoint.latitude}, {waypoint.longitude}
          </div>
          <div className="text-xs text-ink-low mt-1">
            Speed: {waypoint.speed} m/s | Wait: {waypoint.waitTime}s
          </div>
        </div>
        <div className="flex space-x-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              duplicateWaypoint(waypoint.id);
            }}
            className="text-xs text-ink-low hover:text-ink-high p-1 rounded hover:bg-deck-700/50"
            title="Duplicate"
          >
            📄
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeWaypoint(waypoint.id);
            }}
            className="text-xs text-ink-low hover:text-danger hover:bg-danger/20 p-1 rounded"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );

  // Waypoint Editor Component
  const WaypointEditor = () => {
    if (!waypointToEdit) return null;

    const [editData, setEditData] = useState(waypointToEdit);

    const handleSave = () => {
      saveWaypointChanges(editData);
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-deck-900 rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
          <h3 className="font-bold text-lg mb-4">Edit Waypoint</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Waypoint Name</label>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData({...editData, name: e.target.value})}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={editData.latitude}
                  onChange={(e) => setEditData({...editData, latitude: parseFloat(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={editData.longitude}
                  onChange={(e) => setEditData({...editData, longitude: parseFloat(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Speed (m/s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editData.speed}
                  onChange={(e) => setEditData({...editData, speed: parseFloat(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Wait Time (s)</label>
                <input
                  type="number"
                  value={editData.waitTime}
                  onChange={(e) => setEditData({...editData, waitTime: parseInt(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Arrival Radius (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editData.arrivalRadius}
                  onChange={(e) => setEditData({...editData, arrivalRadius: parseFloat(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Heading (°)</label>
                <input
                  type="number"
                  step="1"
                  value={editData.heading}
                  onChange={(e) => setEditData({...editData, heading: parseInt(e.target.value) || 0})}
                  className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select
                value={editData.action}
                onChange={(e) => setEditData({...editData, action: e.target.value})}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              >
                <option value="navigate">Navigate</option>
                <option value="stop">Stop</option>
                <option value="wait">Wait</option>
                <option value="rotate">Rotate</option>
                <option value="dock">Dock</option>
                <option value="undock">Undock</option>
                <option value="return_home">Return Home</option>
                <option value="continue">Continue</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowWaypointEditor(false)}
              className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

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
            {missionStatus === 'RUNNING' ? (
              <span className="text-success">RUNNING</span>
            ) : missionStatus === 'PAUSED' ? (
              <span className="text-warning">PAUSED</span>
            ) : missionStatus === 'COMPLETED' ? (
              <span className="text-green-400">COMPLETED</span>
            ) : missionStatus === 'FAILED' ? (
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
          onClick={optimizeRoute}
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
          onClick={reverseRoute}
          className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors text-xs"
        >
          Reverse
        </button>
        <button
          onClick={clearMission}
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
          onClick={startMission}
          disabled={waypoints.length === 0 || missionStatus === 'RUNNING'}
          className="px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors text-xs disabled:opacity-50"
        >
          Start
        </button>
        <button
          onClick={toggleMissionPause}
          disabled={missionStatus !== 'RUNNING' && missionStatus !== 'PAUSED'}
          className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors text-xs disabled:opacity-50"
        >
          {missionStatus === 'RUNNING' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={cancelMission}
          disabled={missionStatus !== 'RUNNING' && missionStatus !== 'PAUSED'}
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
                <div className="font-bold">0%</div>
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
                waypoints.map((waypoint, index) => renderWaypointItem(waypoint, index))
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

        {/* Right Panel - Mission Execution and Details */}
        <div className="w-3/4 flex flex-col gap-2">
          {/* Mission Execution Panel */}
          <div className="bg-deck-800/50 rounded p-2 flex-1">
            <h4 className="font-bold text-xs mb-1">Mission Execution</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Current Waypoint:</span>
                <span className="font-medium">{currentWaypointIndex + 1}/{waypoints.length}</span>
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
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: '0%' }}></div>
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
        </div>
      </div>

      {/* Waypoint Editor Modal */}
      {showWaypointEditor && <WaypointEditor />}

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
}