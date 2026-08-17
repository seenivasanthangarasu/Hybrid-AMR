import React, { useState } from 'react';
import { Waypoint } from '../types';

interface WaypointEditorProps {
  waypoint: Waypoint | null;
  onSave: (updatedWaypoint: Waypoint) => void;
  onCancel: () => void;
}

const WaypointEditor: React.FC<WaypointEditorProps> = ({ waypoint, onSave, onCancel }) => {
  const [editedWaypoint, setEditedWaypoint] = useState<Waypoint>(waypoint || {
    id: '',
    name: '',
    latitude: 0,
    longitude: 0,
    heading: 0,
    speed: 0.5,
    arrivalRadius: 0.5,
    waitTime: 0,
    action: 'navigate',
    timestamp: Date.now(),
    type: 'normal'
  });

  const handleSave = () => {
    onSave(editedWaypoint);
  };

  const handleChange = (field: keyof Waypoint, value: any) => {
    setEditedWaypoint(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!waypoint) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-deck-900 rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-4">Edit Waypoint</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Waypoint Name</label>
            <input
              type="text"
              value={editedWaypoint.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={editedWaypoint.latitude}
                onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={editedWaypoint.longitude}
                onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
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
                value={editedWaypoint.speed}
                onChange={(e) => handleChange('speed', parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Wait Time (s)</label>
              <input
                type="number"
                value={editedWaypoint.waitTime}
                onChange={(e) => handleChange('waitTime', parseInt(e.target.value) || 0)}
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
                value={editedWaypoint.arrivalRadius}
                onChange={(e) => handleChange('arrivalRadius', parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Heading (°)</label>
              <input
                type="number"
                step="1"
                value={editedWaypoint.heading}
                onChange={(e) => handleChange('heading', parseInt(e.target.value) || 0)}
                className="w-full rounded border border-deck-line bg-deck-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Action</label>
            <select
              value={editedWaypoint.action}
              onChange={(e) => handleChange('action', e.target.value as any)}
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
            onClick={onCancel}
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

export default WaypointEditor;