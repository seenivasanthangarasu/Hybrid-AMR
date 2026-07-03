import useCameraFeed from '../hooks/useCameraFeed.js';
import NoDataBadge from './NoDataBadge.jsx';

export default function CameraView({ compact = false }) {
  const { hasData, imageSrc, topicName, detecting } = useCameraFeed();

  return (
    <div className="relative h-full w-full bg-deck-900">
      {hasData && imageSrc ? (
        <img src={imageSrc} alt="Live robot camera feed" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <NoDataBadge label={detecting ? 'DETECTING CAMERA TOPIC…' : 'NO DATA — camera'} />
        </div>
      )}
      {hasData && !compact && topicName && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] text-ink-mid">
          {topicName}
        </div>
      )}
    </div>
  );
}
