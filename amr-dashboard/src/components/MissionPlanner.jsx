import { useEffect, useState } from 'react';
import RobotCommandService, { CommandError } from '../services/RobotCommandService.js';
import { useMission } from '../context/MissionContext.jsx';
import CommandFeedback from './CommandFeedback.jsx';
import PanelHeader from './ui/PanelHeader.jsx';
import L from 'leaflet';

const DISABLED_REASON = 'Disconnected — commands unavailable';

function errorDetail(err) {
  if (err instanceof CommandError) {
    return err.code === 'DISCONNECTED' ? 'disconnected' : 'publish failed';
  }
  return 'unexpected error';
}

export default function MissionPlanner({ connectionStatus }) {
  const [goalName, setGoalName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [status, setStatus] = useState(null);
  const [coordError, setCoordError] = useState(null);
  const disabled = connectionStatus !== 'connected';
  const { destination, setDestination, mapApi } = useMission();

  useEffect(() => {
    if (destination.latitude !== '') {
      setLatitude(destination.latitude);
    }
    if (destination.longitude !== '') {
      setLongitude(destination.longitude);
    }
  }, [destination]);

  const latNum = parseFloat(latitude);
  const lonNum = parseFloat(longitude);

  // Specific disabled reason for SEND GOAL — names the exact blocker rather
  // than a generically greyed button (spec REQ-19).
  const fieldReason = !goalName.trim()
    ? 'Enter a goal name'
    : latitude === '' || Number.isNaN(latNum)
      ? 'Enter a valid latitude'
      : longitude === '' || Number.isNaN(lonNum)
        ? 'Enter a valid longitude'
        : null;
  const sendReason = disabled ? DISABLED_REASON : fieldReason;
  const canSend = sendReason == null;

  function handleUseCoordinates() {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    // Visible feedback on invalid input instead of a silent no-op (spec REQ-19).
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setCoordError('Enter a valid latitude and longitude first');
      return;
    }
    setCoordError(null);

    setDestination((prev) => ({
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
    if (!canSend) return;
    setStatus({ state: 'SENDING', label: `"${goalName}"`, at: new Date() });
    try {
      const result = RobotCommandService.sendGoal({ goalName, latitude, longitude });
      setStatus({ state: result?.state ?? 'SENT_UNCONFIRMED', label: `"${goalName}"`, at: new Date() });
    } catch (err) {
      setStatus({ state: 'FAILED', label: `"${goalName}"`, at: new Date(), detail: errorDetail(err) });
    }
  }

  return (
    <div className="panel h-full overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader title="MISSION PLANNER" />
      <form onSubmit={handleSendGoal} className="space-y-2">
        <div>
          <label htmlFor="mp-goal-name" className="data-label mb-1 block">
            Goal Name
          </label>
          <input
            id="mp-goal-name"
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            placeholder="e.g. DOCK_A"
            className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="mp-latitude" className="data-label mb-1 block">
              Latitude
            </label>
            <input
              id="mp-latitude"
              value={latitude}
              onChange={(e) => {
                setLatitude(e.target.value);
                setCoordError(null);
                setDestination((prev) => ({ ...prev, latitude: e.target.value }));
              }}
              placeholder="0.000000"
              inputMode="decimal"
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan"
            />
          </div>
          <div>
            <label htmlFor="mp-longitude" className="data-label mb-1 block">
              Longitude
            </label>
            <input
              id="mp-longitude"
              value={longitude}
              onChange={(e) => {
                setLongitude(e.target.value);
                setCoordError(null);
                setDestination((prev) => ({ ...prev, longitude: e.target.value }));
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
          title="Center the main map on the entered coordinates"
          className="w-full rounded bg-signal-amber/20 py-2 font-display text-xs font-bold tracking-[0.1em] text-signal-amber ring-1 ring-signal-amber/40 transition-colors hover:bg-signal-amber/30"
        >
          📍 USE COORDINATES
        </button>
        {coordError && (
          <p className="font-mono text-[10px] text-signal-amber" role="status" aria-live="polite">
            {coordError}
          </p>
        )}

        <span
          title={canSend ? undefined : sendReason}
          className={`block ${canSend ? '' : 'cursor-not-allowed'}`}
        >
          <button
            type="submit"
            disabled={!canSend}
            aria-disabled={!canSend}
            aria-describedby={canSend ? undefined : 'send-goal-reason'}
            className={`w-full rounded bg-signal-cyan/15 py-2 font-display text-xs font-bold tracking-[0.1em] text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25 disabled:opacity-40 ${
              canSend ? '' : 'pointer-events-none'
            }`}
          >
            SEND GOAL
          </button>
        </span>
        {!canSend && (
          <p
            id="send-goal-reason"
            className="font-mono text-[10px] text-ink-low"
            role="status"
            aria-live="polite"
          >
            {sendReason}
          </p>
        )}
      </form>
      <CommandFeedback status={status} />
    </div>
  );
}
