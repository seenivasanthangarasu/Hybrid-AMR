/** Settings module — ROSBridge, map tiles, robot params, theme, units */
import { useState } from 'react'
import { Input, Select, Button } from '@/components/ui'

export default function SettingsModule() {
  const [rosUrl, setRosUrl] = useState('ws://localhost:9090')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [unitDistance, setUnitDistance] = useState<'metric' | 'imperial'>('metric')

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-text-primary">ROSBridge</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">WebSocket URL</label>
          <Input value={rosUrl} onChange={(e) => setRosUrl(e.target.value)} placeholder="ws://localhost:9090" />
        </div>
      </section>
      <hr className="border-border" />
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-text-primary">Map Tiles</h2>
        <Select value="osm-light" onChange={() => {}}>
          <option value="osm-standard">OpenStreetMap</option>
          <option value="osm-light">CartoDB Light</option>
        </Select>
      </section>
      <hr className="border-border" />
      <section className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-text-primary">Theme</h2><p className="text-sm text-text-secondary">Switch between light and dark mode</p></div>
        <Select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}><option value="light">Light</option><option value="dark">Dark</option></Select>
      </section>
      <hr className="border-border" />
      <section className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-text-primary">Distance Unit</h2><p className="text-sm text-text-secondary">How distances are displayed on the map</p></div>
        <Select value={unitDistance} onChange={(e) => setUnitDistance(e.target.value as 'metric' | 'imperial')}><option value="metric">Meters (metric)</option><option value="imperial">Feet (imperial)</option></Select>
      </section>
      <Button className="w-full touch-lg">Save Settings</Button>
    </div>
  )
}
