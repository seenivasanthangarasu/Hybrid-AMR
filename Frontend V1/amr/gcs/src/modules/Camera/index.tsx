/** Camera module — video feed display with source switching */
import { useEffect } from 'react'
import { useCameraStore } from '@/stores/cameraStore'
import { getAvailableCameras } from '@/services/topics/camera'

export default function CameraModule() {
  const sources = useCameraStore((s) => s.sources)
  const activeSourceId = useCameraStore((s) => s.activeSourceId)
  const setSources = useCameraStore((s) => s.setSources)

  // Auto-load camera sources on mount (reads web_video_server URL from rosbridge config)
  useEffect(() => {
    const detected = getAvailableCameras()
    if (detected.length > 0 && !activeSourceId) {
      setSources(detected as any)
    }
  }, [])

  return (
    <div className="w-full h-full bg-black rounded-xl overflow-hidden relative">
      {sources.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-text-muted space-y-3">
            <p className="text-lg font-semibold">No camera feeds available</p>
            <p className="text-sm">Connect a camera to the robot and refresh.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Video feed rendered from activeSourceId streamUrl — points to web_video_server */}
          <img src={sources.find((s) => s.id === activeSourceId)?.streamUrl || ''} alt="Camera feed" className="w-full h-full object-contain" />
          {/* Source switcher overlay at bottom */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-white/90 backdrop-blur rounded-lg border">
            {sources.map((s) => (
              <button key={s.id} className={`px-3 py-1.5 text-sm font-medium rounded ${s.id === activeSourceId ? 'bg-brand text-white' : 'hover:bg-bgSecondary'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
