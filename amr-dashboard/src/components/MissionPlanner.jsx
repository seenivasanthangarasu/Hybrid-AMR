import { useEffect, useState } from 'react';
import RobotCommandService from '../services/RobotCommandService.js';
import { useMission } from '../context/MissionContext.jsx';
import L from 'leaflet';
export default function MissionPlanner() {
  const [goalName, setGoalName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [lastSent, setLastSent] = useState(null);
  const { destination, setDestination, mapApi } = useMission();
  
  useEffect(() => {

  if (destination.latitude !== '') {
    setLatitude(destination.latitude);
  }

  if (destination.longitude !== '') {
    setLongitude(destination.longitude);
  }

}, [destination]);

  const valid = goalName.trim() && latitude !== '' && longitude !== '';
  
  function handleUseCoordinates() {

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon)) return;

  setDestination(prev => ({
    ...prev,
    latitude: lat.toFixed(7),
    longitude: lon.toFixed(7),
  }));

  if (!mapApi) return;

  const { map, destinationMarkerRef } = mapApi;

  if (!destinationMarkerRef.current) {

    destinationMarkerRef.current = L.marker([lat, lon]).addTo(map);

  } else {

    destinationMarkerRef.current.setLatLng([lat, lon]);

  }

  map.setView([lat, lon], 18);
}

  function handleSendGoal(e) {
    e.preventDefault();
    if (!valid) return;
    RobotCommandService.sendGoal({ goalName, latitude, longitude });
    setLastSent({ goalName, latitude, longitude, at: new Date() });
  }

  return (
    <div className="panel rounded-md p-3 shadow-panel">
      <h3 className="mb-2 font-display text-[11px] font-bold tracking-[0.14em] text-ink-mid">MISSION PLANNER</h3>
      <form onSubmit={handleSendGoal} className="space-y-2">
        <div>
          <label className="data-label mb-1 block">Goal Name</label>
          <input
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            placeholder="e.g. DOCK_A"
            className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="data-label mb-1 block">Latitude</label>
            <input
              value={latitude}
              onChange={(e) => {
  setLatitude(e.target.value);

  setDestination(prev => ({
    ...prev,
    latitude: e.target.value,
  }));
}}
              placeholder="0.000000"
              inputMode="decimal"
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
            />
          </div>
          <div>
            <label className="data-label mb-1 block">Longitude</label>
            <input
              value={longitude}
              onChange={(e) => {
  setLongitude(e.target.value);

  setDestination(prev => ({
    ...prev,
    longitude: e.target.value,
  }));
}}
              placeholder="0.000000"
              inputMode="decimal"
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
            />
          </div>
        </div>
               <button
          type="button"
          onClick={handleUseCoordinates}
          className="w-full rounded bg-yellow-500/20 py-2 font-display text-xs font-bold tracking-[0.1em] text-yellow-400 ring-1 ring-yellow-500/40 hover:bg-yellow-500/30"
        >
          📍 USE COORDINATES
        </button>

        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded bg-signal-cyan/15 py-2 font-display text-xs font-bold tracking-[0.1em] text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          SEND GOAL
        </button>
      </form>
      {lastSent && (
        <p className="mt-2 font-mono text-[10px] text-ink-low">
          Sent “{lastSent.goalName}” @ {lastSent.latitude}, {lastSent.longitude} —{' '}
          {lastSent.at.toLocaleTimeString([], { hour12: false })}
        </p>
      )}
    </div>
  );
}
