import { useRef } from 'react';
import useUrdfViewer from '../hooks/useUrdfViewer.js';
import NoDataBadge from './NoDataBadge.jsx';

export default function UrdfWidget() {
  const containerRef = useRef(null);
  const { status } = useUrdfViewer(containerRef);

  return (
    <div className="relative h-full w-full bg-deck-900">
      <div id="urdf-viewer-container" ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-deck-900/85">
          <NoDataBadge
            label={
              status === 'loading'
                ? 'LOADING URDF…'
                : status === 'error'
                ? 'NO DATA — /robot_description'
                : 'NO DATA — /robot_description'
            }
          />
        </div>
      )}
    </div>
  );
}
