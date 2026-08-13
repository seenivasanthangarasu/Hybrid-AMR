import { useEffect, useMemo, useRef, useState } from 'react';
import RobotCommandService, { CommandError } from '../services/RobotCommandService.js';
import { useMission, useMapApi } from '../context/MissionContext.jsx';
import {
  entryError,
  formatDistance,
  routeDistanceMeters,
  routeError,
  WAYPOINT_SENT,
} from '../utils/waypoints.js';
import CommandFeedback from './CommandFeedback.jsx';
import PanelHeader from './ui/PanelHeader.jsx';
import SignalDot from './ui/SignalDot.jsx';

const DISABLED_REASON = 'Disconnected — commands unavailable';

const FIELD_CLASS =
  'w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan';

const ROW_BTN_CLASS =
  'px-1 font-mono text-[11px] text-ink-mid transition-colors hover:text-signal-cyan disabled:opacity-25 disabled:hover:text-ink-mid';

function errorDetail(err) {
  if (err instanceof CommandError) {
    if (err.code === 'DISCONNECTED') return 'disconnected';
    if (err.code === 'EMPTY_ROUTE') return 'no waypoints';
    return 'publish failed';
  }
  return 'unexpected error';
}

function WaypointRow({ waypoint, index, total, selected, onSelect, onMove, onRemove }) {
  const sent = waypoint.status === WAYPOINT_SENT;
  return (
    <li
      data-wp-id={waypoint.id}
      className={`flex items-center gap-2 rounded border px-2 py-1.5 transition-colors ${
        selected
          ? 'border-signal-cyan/60 bg-signal-cyan/10'
          : 'border-deck-line bg-deck-900 hover:border-deck-line/80'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal-cyan/20 font-mono text-[10px] font-bold text-signal-cyan">
        {index + 1}
      </span>

      {/* A real button, not a click handler on the <li>: selecting a waypoint
          is an action, so it must be reachable by keyboard. It also means the
          reorder/remove controls no longer need stopPropagation. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        // Explicit label: without it every row announces the same tooltip text,
        // so a screen-reader user cannot tell the rows apart.
        aria-label={`Show ${waypoint.name} on the map`}
        title="Show this waypoint on the map"
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-signal-cyan"
      >
        <span className="block truncate font-mono text-[11px] text-ink-high">{waypoint.name}</span>
        <span className="block truncate font-mono text-[10px] text-ink-low">
          {Number(waypoint.latitude).toFixed(6)}, {Number(waypoint.longitude).toFixed(6)}
        </span>
      </button>

      <span
        className="flex shrink-0 items-center gap-1"
        title={sent ? 'Sent to the robot — no acknowledgement received' : 'Not sent yet'}
      >
        <SignalDot tone={sent ? 'warn' : 'info'} />
      </span>

      <span className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Move ${waypoint.name} earlier`}
          className={ROW_BTN_CLASS}
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Move ${waypoint.name} later`}
          className={ROW_BTN_CLASS}
        >
          ▼
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${waypoint.name}`}
          className="px-1 font-mono text-[11px] text-ink-mid transition-colors hover:text-signal-red"
        >
          ✕
        </button>
      </span>
    </li>
  );
}

export default function MissionPlanner({ connectionStatus }) {
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [status, setStatus] = useState(null);
  const [addError, setAddError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const {
    waypoints,
    selectedId,
    setSelectedId,
    addWaypoint,
    removeWaypoint,
    moveWaypoint,
    clearWaypoints,
    markRouteSent,
  } = useMission();
  const { mapApi } = useMapApi();

  const listRef = useRef(null);
  const disabled = connectionStatus !== 'connected';

  // Both buttons name the exact blocker rather than greying out silently
  // (spec REQ-19). ADD is a local edit, so it stays usable while disconnected —
  // an operator can build a route before the link comes back; only the
  // dispatch is gated on the connection.
  const addReason = entryError({ name, latitude, longitude });
  const sendReason = disabled ? DISABLED_REASON : routeError(waypoints);
  const canSend = sendReason == null;

  const routeLength = useMemo(() => formatDistance(routeDistanceMeters(waypoints)), [waypoints]);

  // Keep the selected row visible. Selection often originates on the MAP (the
  // operator clicks a pin), and the matching row can be scrolled out of sight
  // in a long route.
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-wp-id="${selectedId}"]`);
    // Optional call, not just optional access: jsdom has no scrollIntoView, and
    // keeping the row visible is a nicety that must never break the panel.
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  // A stale "are you sure?" left armed on an already-empty route would fire on
  // the next route the operator builds.
  useEffect(() => {
    if (waypoints.length === 0) setConfirmClear(false);
  }, [waypoints.length]);

  function focusOnMap(wp) {
    mapApi?.map?.panTo([Number(wp.latitude), Number(wp.longitude)]);
  }

  function handleAdd(e) {
    e.preventDefault();
    if (addReason) {
      setAddError(addReason);
      return;
    }
    setAddError(null);

    const wp = addWaypoint({ name, latitude, longitude });
    setName('');
    setLatitude('');
    setLongitude('');

    // Centre the main map on what was just added so the operator sees where
    // the pin landed instead of hunting for it.
    mapApi?.map?.setView([wp.latitude, wp.longitude], 18);
  }

  function handleSelect(wp) {
    setSelectedId(wp.id);
    focusOnMap(wp);
  }

  function handleSendRoute(e) {
    e.preventDefault();
    if (!canSend) return;

    const label = `route (${waypoints.length} waypoint${waypoints.length === 1 ? '' : 's'})`;
    setStatus({ state: 'SENDING', label, at: new Date() });
    try {
      const result = RobotCommandService.sendWaypoints(waypoints);
      markRouteSent();
      setStatus({ state: result?.state ?? 'SENT_UNCONFIRMED', label, at: new Date() });
    } catch (err) {
      setStatus({ state: 'FAILED', label, at: new Date(), detail: errorDetail(err) });
    }
  }

  return (
    // overflow-auto, not overflow-hidden: this panel is user-resizable and is
    // routinely dragged down to ~2 grid rows. Below the height its fixed
    // sections need, a clipped flex column lets those sections overflow their
    // boxes and paint over each other (the dispatch button ended up covering
    // CLEAR ALL). Letting the whole panel scroll is the fallback; the route
    // list still scrolls on its own whenever there is room for it to.
    <div className="panel flex h-full flex-col overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader title="MISSION PLANNER" />

      {/* Its own form so Enter in any field appends the waypoint — a sibling
          of the dispatch form below, never nested inside it. */}
      <form onSubmit={handleAdd} className="shrink-0 space-y-2">
        <div>
          <label htmlFor="mp-wp-name" className="data-label mb-1 block">
            Waypoint Name
          </label>
          <input
            id="mp-wp-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setAddError(null);
            }}
            placeholder="e.g. DOCK_A"
            className={FIELD_CLASS}
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
                setAddError(null);
              }}
              placeholder="0.000000"
              inputMode="decimal"
              className={FIELD_CLASS}
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
                setAddError(null);
              }}
              placeholder="0.000000"
              inputMode="decimal"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <button
          type="submit"
          title="Append this position to the route — or click the main map"
          className="w-full rounded bg-signal-amber/20 py-2 font-display text-xs font-bold tracking-[0.1em] text-signal-amber ring-1 ring-signal-amber/40 transition-colors hover:bg-signal-amber/30"
        >
          📍 ADD WAYPOINT
        </button>
        {addError && (
          <p className="font-mono text-[10px] text-signal-amber" role="status" aria-live="polite">
            {addError}
          </p>
        )}
      </form>

      {/* Route list. Only this section scrolls, so ADD stays reachable at the
          top and SEND ROUTE stays pinned at the bottom on a long route. */}
      {/* Auto height, never a flex-1/min-h-0 pair: that collapses this section
          to 0px in a short panel and its rows then overflow on top of the
          dispatch button. The list caps its own height and scrolls instead. */}
      <div className="mt-3 flex shrink-0 flex-col">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="data-label truncate">
            Route · {waypoints.length}
            {/* Straight-line, and labelled as such: this is not the distance
                the robot will drive, only a sanity-check on the ordering. */}
            {routeLength && (
              <span className="text-ink-low"> · {routeLength} straight-line</span>
            )}
          </span>
          {waypoints.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="shrink-0 font-mono text-[10px] text-ink-low transition-colors hover:text-signal-red"
            >
              CLEAR ALL
            </button>
          )}
        </div>

        {/* Clearing the route cannot be undone, so it takes a second, explicit
            press rather than firing on a single mis-click. */}
        {confirmClear && (
          <div
            className="mb-1 flex items-center justify-between gap-2 rounded border border-signal-red/40 bg-signal-red/10 px-2 py-1"
            role="alert"
          >
            <span className="font-mono text-[10px] text-ink-high">
              Discard all {waypoints.length}?
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  clearWaypoints();
                  setConfirmClear(false);
                }}
                className="font-mono text-[10px] font-bold text-signal-red transition-opacity hover:opacity-80"
              >
                DISCARD
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="font-mono text-[10px] text-ink-low transition-colors hover:text-ink-high"
              >
                KEEP
              </button>
            </span>
          </div>
        )}

        {waypoints.length === 0 ? (
          <p className="rounded border border-dashed border-deck-line px-2 py-3 text-center font-mono text-[10px] text-ink-low">
            No waypoints — add one above, or click the main map
          </p>
        ) : (
          // Capped so a long route scrolls here rather than stretching the
          // panel past its grid cell.
          <ol ref={listRef} className="max-h-48 space-y-1 overflow-auto pr-0.5">
            {waypoints.map((wp, i) => (
              <WaypointRow
                key={wp.id}
                waypoint={wp}
                index={i}
                total={waypoints.length}
                selected={wp.id === selectedId}
                onSelect={() => handleSelect(wp)}
                onMove={(delta) => moveWaypoint(wp.id, delta)}
                onRemove={() => removeWaypoint(wp.id)}
              />
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={handleSendRoute} className="mt-2 shrink-0">
        <span
          title={canSend ? undefined : sendReason}
          className={`block ${canSend ? '' : 'cursor-not-allowed'}`}
        >
          <button
            type="submit"
            disabled={!canSend}
            aria-disabled={!canSend}
            aria-describedby={canSend ? undefined : 'send-route-reason'}
            className={`w-full rounded bg-signal-cyan/15 py-2 font-display text-xs font-bold tracking-[0.1em] text-signal-cyan ring-1 ring-signal-cyan/40 transition-colors hover:bg-signal-cyan/25 disabled:opacity-40 ${
              canSend ? '' : 'pointer-events-none'
            }`}
          >
            SEND ROUTE{waypoints.length > 0 ? ` (${waypoints.length})` : ''}
          </button>
        </span>
        {!canSend && (
          <p
            id="send-route-reason"
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
