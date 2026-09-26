import useOdometry from '../hooks/useOdometry.js';
import useGps from '../hooks/useGps.js';
import useGnssQuality from '../hooks/useGnssQuality.js';
import useNow from '../hooks/useNow.js';
import PanelHeader from './ui/PanelHeader.jsx';
import FreshnessBadge from './ui/FreshnessBadge.jsx';
import { toneFor } from './ui/signalTones.js';
import { classifyFreshness } from '../utils/freshness.js';
import { dopQuality, fixed, formatDistance, satCountQuality } from '../utils/gnss.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

// Stale values are still shown (dimmed) so the operator sees the last reading;
// LIVE values render at full weight, NO DATA renders the placeholder.
function valueClassFor(state, base = 'text-ink-high') {
  return state === 'STALE' ? 'text-ink-mid opacity-70' : base;
}

// Large glance-first readout for the values an operator watches most.
function Hero({ label, value, unit, valueClass = 'text-ink-high', badge }) {
  return (
    <div className="flex min-h-[3.75rem] flex-col justify-between rounded bg-deck-900/50 p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="data-label">{label}</span>
        {badge}
      </div>
      <div className={`data-value text-lg font-bold leading-none ${valueClass}`}>
        {value == null || value === '' ? (
          <span className="no-data text-xs">—</span>
        ) : (
          <>
            {value}
            {unit && <span className="ml-1 text-[10px] font-normal text-ink-low">{unit}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Fixed-height secondary row so value ↔ NO DATA ↔ stale never reflows siblings.
function Row({ label, value, unit, valueClass = 'text-ink-high', badge }) {
  return (
    <div className="flex h-8 items-center justify-between border-b border-deck-line/60 last:border-0">
      <span className="data-label">{label}</span>
      <div className="flex items-center gap-2">
        {badge}
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
    </div>
  );
}

// Separate component for GPS rows to ensure zero GPS/GNSS subscriptions exist in indoor mode
function GpsStatusRows({ now }) {
  const gps = useGps();
  const gnss = useGnssQuality();

  const gpsFresh = classifyFreshness(
    { hasData: gps.hasData, hasEverData: gps.hasEverData, lastReceivedAt: gps.lastReceivedAt },
    now,
  );

  const hdop = gnss.dop?.hdop ?? null;
  const hdopQ = dopQuality(hdop);
  const satsUsed = gnss.solution?.satellitesUsed ?? gnss.sats?.used ?? null;
  const satsVisible = gnss.sats?.visible ?? null;
  const satQ = satCountQuality(satsUsed);
  const accuracy = formatDistance(gnss.estimated?.horizontal ?? gnss.derived?.sigmaH ?? null);

  return (
    <>
      <Row
        label="GPS Status"
        value={gps.fixStatus}
        valueClass={gps.hasData ? 'text-signal-green' : valueClassFor(gpsFresh.state)}
        badge={<FreshnessBadge freshness={gpsFresh} dotOnly />}
      />
      <Row
        label="Latitude"
        value={gps.latitude != null ? gps.latitude.toFixed(6) : null}
        valueClass={valueClassFor(gpsFresh.state)}
      />
      <Row
        label="Longitude"
        value={gps.longitude != null ? gps.longitude.toFixed(6) : null}
        valueClass={valueClassFor(gpsFresh.state)}
      />
      <Row
        label="Satellites"
        value={satsUsed == null ? null : satsVisible == null ? `${satsUsed}` : `${satsUsed}/${satsVisible}`}
        valueClass={satsUsed != null ? toneFor(satQ.tone).text : valueClassFor(gpsFresh.state)}
      />
      <Row
        label="HDOP"
        value={fixed(hdop, 2)}
        valueClass={hdop != null ? toneFor(hdopQ.tone).text : valueClassFor(gpsFresh.state)}
      />
      <Row
        label="Accuracy"
        value={accuracy?.value ?? null}
        unit={accuracy?.unit}
        valueClass={valueClassFor(gpsFresh.state)}
      />
    </>
  );
}

export default function StatusPanel({ mode, connectionStatus, environment }) {
  const now = useNow(1000);
  const odom = useOdometry();
  const workspace = useWorkspace();

  const effectiveEnv =
    environment || workspace.effectiveEnvironment || (mode?.toLowerCase() === 'indoor' ? 'indoor' : 'outdoor');
  const isIndoor = effectiveEnv === 'indoor';

  const odomFresh = classifyFreshness(
    { hasData: odom.hasData, hasEverData: odom.hasEverData, lastReceivedAt: odom.lastReceivedAt },
    now,
  );

  const connLabel = {
    connected: 'LINKED',
    connecting: 'CONNECTING',
    error: 'ERROR',
    closed: 'CLOSED',
    disconnected: 'OFFLINE',
  }[connectionStatus];
  const connTone =
    connectionStatus === 'connected' ? 'live' : connectionStatus === 'connecting' ? 'warn' : 'critical';

  const displayMode = workspace.isConfigured ? workspace.environment?.toUpperCase() : mode;
  const modeClass = displayMode === 'INDOOR' ? 'text-signal-violet' : 'text-signal-cyan';

  const speed = odom.linearVelocity != null ? odom.linearVelocity.toFixed(2) : null;
  const heading = odom.heading != null ? odom.heading.toFixed(1) : null;
  const distance = odom.hasEverData ? odom.distanceTravelled.toFixed(1) : null;

  return (
    <div className="panel h-full overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader title="STATUS" />

      {/* Hero readouts — the three values watched most, largest weight */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Hero label="Mode" value={displayMode} valueClass={modeClass} />
        <Hero
          label="Speed"
          value={speed}
          unit="m/s"
          valueClass={valueClassFor(odomFresh.state)}
          badge={<FreshnessBadge freshness={odomFresh} dotOnly />}
        />
        <Hero label="Link" value={connLabel} valueClass={toneFor(connTone).text} />
      </div>

      <Row
        label="Heading"
        value={heading}
        unit="deg"
        valueClass={valueClassFor(odomFresh.state)}
        badge={<FreshnessBadge freshness={odomFresh} dotOnly />}
      />
      <Row label="Distance" value={distance} unit="m" valueClass={valueClassFor(odomFresh.state)} />

      {/* Only mount GPS and GNSS rows in outdoor / hybrid-outdoor modes */}
      {!isIndoor && <GpsStatusRows now={now} />}

      {/* A rejected odometry jump (localization reset / TF discontinuity) is
          surfaced instead of being silently discarded (spec REQ-07). */}
      {odom.lastRejectedJumpAt && (
        <p className="mt-2 font-mono text-[10px] text-signal-amber" role="status" aria-live="polite">
          resync detected {odom.lastRejectedJumpAt.toLocaleTimeString([], { hour12: false })}
        </p>
      )}
    </div>
  );
}
