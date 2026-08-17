import { useMissionStore } from '@/stores/missionStore'
import { returnHome } from '@/services/topics/mission'

/** Dock command — published to /dock topic */
function dockCommand(): void { /* placeholder for future implementation */ }

export function useMissionActions() {
  const start = useMissionStore((s) => s.startMission)
  const pause = useMissionStore((s) => s.pauseMission)
  const resume = useMissionStore((s) => s.resumeMission)
  const stop = useMissionStore((s) => s.stopMission)

  return {
    start: async () => { await start() },
    pause: async () => { await pause() },
    resume: async () => { await resume() },
    stop: async () => { await stop() },
    returnHome,
    dock: dockCommand,
  }
}
