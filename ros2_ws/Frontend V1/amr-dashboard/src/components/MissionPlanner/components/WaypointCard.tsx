import React from 'react';
import { Waypoint } from '../types';

interface WaypointCardProps {
  waypoint: Waypoint;
  isSelected: boolean;
  onClick: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const WaypointCard: React.FC<WaypointCardProps> = ({
  waypoint,
  isSelected,
  onClick,
  onDuplicate,
  onDelete
}) => {
  return (
    <div
      className={`p-3 mb-2 rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-blue-500/20 border-2 border-blue-400'
          : 'bg-deck-800/50 hover:bg-deck-700/50'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="font-bold text-sm">{waypoint.name}</div>
          <div className="text-xs text-ink-low mt-1">
            {waypoint.latitude.toFixed(6)}, {waypoint.longitude.toFixed(6)}
          </div>
          <div className="text-xs text-ink-low mt-1">
            Speed: {waypoint.speed} m/s | Wait: {waypoint.waitTime}s
          </div>
        </div>
        <div className="flex space-x-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(waypoint.id);
            }}
            className="text-xs text-ink-low hover:text-ink-high p-1 rounded hover:bg-deck-700/50"
            title="Duplicate"
          >
            📄
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(waypoint.id);
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
};

export default WaypointCard;