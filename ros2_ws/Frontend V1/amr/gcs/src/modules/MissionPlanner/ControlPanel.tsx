import { Button } from '@/components/ui'
import { Play, Pause, Square, Home, BatteryCharging, Zap } from 'lucide-react'

export function ControlPanel() {
  return (
    <div className="flex items-center gap-2 p-3 bg-white/95 backdrop-blur rounded-xl border shadow-card">
      <Button size="lg" variant="default"><Play className="w-5 h-5" /> Start</Button>
      <Button size="lg" variant="secondary"><Pause className="w-5 h-5" /> Pause</Button>
      <Button size="lg" variant="secondary"><Play className="w-5 h-5" /> Resume</Button>
      <div className="w-px h-10 bg-border mx-1" />
      <Button size="lg" variant="secondary"><Square className="w-5 h-5" /> Stop</Button>
      <Button size="lg" variant="secondary"><Home className="w-5 h-5" /> Return Home</Button>
      <Button size="lg" variant="secondary"><BatteryCharging className="w-5 h-5" /> Dock</Button>
      <div className="w-px h-10 bg-border mx-1" />
      <Button size="lg" variant="destructive"><Zap className="w-6 h-6" /> E-STOP</Button>
    </div>
  )
}
