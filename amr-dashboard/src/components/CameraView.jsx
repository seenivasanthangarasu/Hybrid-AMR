import NoDataBadge from './NoDataBadge.jsx';

const CAMERA_STREAM =
  "http://localhost:8080/stream?topic=/camera/camera/color/image_raw";

export default function CameraView({ compact = false }) {

  return (
    <div className="relative h-full w-full bg-deck-900">

      <img
        src={CAMERA_STREAM}
        alt="Live Camera"
        className="h-full w-full object-cover"
        onError={(e) => {
          e.target.style.display = "none";
          document.getElementById("camera-no-data")?.classList.remove("hidden");
        }}
      />

      <div
        id="camera-no-data"
        className="absolute inset-0 hidden items-center justify-center"
      >
        <NoDataBadge label="NO CAMERA STREAM" />
      </div>

      {!compact && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-deck-900/80 px-2 py-1 font-mono text-[10px] text-ink-mid">
          /camera/camera/color/image_raw
        </div>
      )}

    </div>
  );
}
