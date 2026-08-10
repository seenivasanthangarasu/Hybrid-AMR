import { useRef } from 'react';
import useUrdfViewer from '../hooks/useUrdfViewer.js';
import DataFallback from './DataFallback.jsx';

// The URDF viewer's states aren't ROS-topic freshness, so each maps to an
// explicit label/tone (spec REQ-04 keeps the specific mesh-server wording).
const STATUS_FALLBACK = {
  loading: { label: 'LOADING URDF…', tone: 'info', pulse: true },
  'no-mesh-server': { label: 'NO MESH SERVER CONFIGURED', tone: 'warn' },
  error: { label: 'URDF VIEWER FAILED TO LOAD', tone: 'critical' },
};

export default function UrdfWidget() {
  const containerRef = useRef(null);
  const { status } = useUrdfViewer(containerRef);

  return (
    <div className="relative h-full w-full bg-deck-900">
      <div id="urdf-viewer-container" ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <DataFallback
            topic="/robot_description"
            {...(STATUS_FALLBACK[status] ?? { label: 'NO DATA', tone: 'idle' })}
          />
        </div>
      )}
    </div>
  );
}
