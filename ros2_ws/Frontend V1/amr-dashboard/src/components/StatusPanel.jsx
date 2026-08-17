import useOdometry from '../hooks/useOdometry.js';
import useGps from '../hooks/useGps.js';
import useRobotMode from '../hooks/useRobotMode.js';
import useRosConnection from '../hooks/useRosConnection.js';

function Row({ label, value, unit, valueClass = 'text-ink-high' }) {
  return (
    <div className="flex items-center justify-between border-b border-deck-line/60 py-2 last:border-0">
      <span className="data-label">{label}</span>
      <span className={`data-value text-sm font-semibold ${valueClass}`}>
        {value === null || value === undefined ? (
          <span className="no-data text-[11px]">NO DATA</span>
        ) : (
          <>
            {value}
            {unit && <span className="ml-1 text-[11px] text-ink-low">{unit}</span>}
          </>
        )}
      </span>
    </div>
  );
}

export default function StatusPanel({ mode, connectionStatus }) {
  const { hasData: hasOdom, linearVelocity, heading, distanceTravelled } = useOdometry();
  const { hasData: hasGps, latitude, longitude, fixStatus } = useGps();
  const { status: rosStatus } = useRosConnection();

  const connLabel = {
    connected: 'LINKED',
    connecting: 'CONNECTING',
    error: 'ERROR',
    closed: 'CLOSED',
    disconnected: 'OFFLINE',
  }[rosStatus];

  const connClass =
    rosStatus === 'connected' ? 'text-signal-green' : rosStatus === 'connecting' ? 'text-signal-amber' : 'text-signal-red';

  return (
    <div className="panel rounded-md p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-ink-mid">STATUS</h3>
      </div>
      <Row label="Mode" value={mode} />
      <Row label="Speed" value={hasOdom && linearVelocity !== null ? linearVelocity.toFixed(2) : null} unit="m/s" />
      <Row label="Heading" value={hasOdom && heading !== null ? heading.toFixed(1) : null} unit="deg" />
      <Row label="Distance" value={hasOdom ? distanceTravelled.toFixed(1) : null} unit="m" />
      <Row label="GPS Status" value={hasGps ? fixStatus : null} valueClass={hasGps ? 'text-signal-green' : ''} />
      <Row label="Latitude" value={hasGps ? latitude.toFixed(6) : null} />
      <Row label="Longitude" value={hasGps ? longitude.toFixed(6) : null} />
      <Row label="ROS Connection" value={connLabel} valueClass={connClass} />

      {/* Additional Status Info */}
      <div className="mt-3">
        <div className="data-label mb-1">MISSION STATUS</div>
        <div className="rounded bg-deck-800/50 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span>Current Task</span>
            <span className="text-signal-cyan">Navigating to waypoint</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Progress</span>
            <span className="text-signal-green">65%</span>
          </div>
        </div>
      </div>
    </div>
  );
}