import useImu from '../hooks/useImu.js';
import useNow from '../hooks/useNow.js';
import PanelHeader from './ui/PanelHeader.jsx';
import FreshnessBadge from './ui/FreshnessBadge.jsx';
import { classifyFreshness } from '../utils/freshness.js';

/**
 * ImuPanel
 * Displays live data from /hiwonder/imu/data_raw and /hiwonder/imu/mag.
 * Shows orientation (roll/pitch/yaw), linear acceleration, gyroscope, and
 * magnetometer. All values show NO DATA when the topic is silent — no
 * synthetic zeros are ever shown.
 */

function fmt(v, decimals = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(decimals);
}

function valueClass(fresh) {
  if (fresh.state === 'LIVE') return 'text-ink-high';
  if (fresh.state === 'STALE') return 'text-ink-mid opacity-70';
  return 'text-ink-low';
}

/** Three-component XYZ row group */
function XYZBlock({ label, x, y, z, unit, vClass }) {
  return (
    <div className="rounded bg-deck-900/40 p-2">
      <p className="mb-1 font-mono text-[9px] font-semibold tracking-widest text-ink-low uppercase">
        {label}
        {unit && <span className="ml-1 font-normal normal-case text-ink-low/60">{unit}</span>}
      </p>
      <div className="grid grid-cols-3 gap-1">
        {[['X', x], ['Y', y], ['Z', z]].map(([axis, val]) => (
          <div key={axis} className="flex flex-col items-center rounded bg-deck-950/60 px-1 py-1">
            <span className="font-mono text-[8px] text-ink-low">{axis}</span>
            <span className={`font-mono text-[11px] font-bold leading-tight tabular-nums ${vClass}`}>
              {val != null ? val : <span className="text-[9px] text-ink-low/60">—</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Single value row */
function Row({ label, value, unit, vClass }) {
  return (
    <div className="flex h-7 items-center justify-between border-b border-deck-line/50 last:border-0">
      <span className="font-mono text-[10px] text-ink-low">{label}</span>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${vClass}`}>
        {value != null ? (
          <>
            {value}
            {unit && <span className="ml-0.5 text-[9px] font-normal text-ink-low">{unit}</span>}
          </>
        ) : (
          <span className="text-[9px] text-ink-low/60">NO DATA</span>
        )}
      </span>
    </div>
  );
}

/** Section divider */
function SectionLabel({ children, badge }) {
  return (
    <div className="mb-1 mt-2 flex items-center justify-between">
      <span className="font-mono text-[9px] font-bold tracking-widest text-ink-mid uppercase">
        {children}
      </span>
      {badge}
    </div>
  );
}

export default function ImuPanel() {
  const now = useNow(1000);
  const imu = useImu();

  const imuFresh = classifyFreshness(imu.timing.imu, now);
  const magFresh = classifyFreshness(imu.timing.mag, now);

  const imuVC = valueClass(imuFresh);
  const magVC = valueClass(magFresh);

  return (
    <div className="panel h-full overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader title="IMU" />

      {/* ── Orientation ─────────────────────────────────────── */}
      <SectionLabel badge={<FreshnessBadge freshness={imuFresh} />}>Orientation</SectionLabel>
      <div className="space-y-0.5">
        <Row label="Roll"  value={fmt(imu.roll,  1)} unit="°" vClass={imuVC} />
        <Row label="Pitch" value={fmt(imu.pitch, 1)} unit="°" vClass={imuVC} />
        <Row label="Yaw"   value={fmt(imu.yaw,   1)} unit="°" vClass={imuVC} />
      </div>

      {/* ── Linear Acceleration ────────────────────────────── */}
      <SectionLabel>Linear Accel</SectionLabel>
      <XYZBlock
        label="m/s²"
        x={fmt(imu.accel.x)}
        y={fmt(imu.accel.y)}
        z={fmt(imu.accel.z)}
        vClass={imuVC}
      />
      <div className="mt-1">
        <Row label="|a|" value={fmt(imu.accel.magnitude)} unit="m/s²" vClass={imuVC} />
      </div>

      {/* ── Gyroscope ─────────────────────────────────────── */}
      <SectionLabel>Gyroscope</SectionLabel>
      <XYZBlock
        label="°/s"
        x={fmt(imu.gyro.x, 1)}
        y={fmt(imu.gyro.y, 1)}
        z={fmt(imu.gyro.z, 1)}
        vClass={imuVC}
      />
      <div className="mt-1">
        <Row label="|ω|" value={fmt(imu.gyro.magnitude, 1)} unit="°/s" vClass={imuVC} />
      </div>

      {/* ── Magnetometer ──────────────────────────────────── */}
      <SectionLabel badge={<FreshnessBadge freshness={magFresh} />}>Magnetometer</SectionLabel>
      <XYZBlock
        label="µT"
        x={fmt(imu.mag.x, 2)}
        y={fmt(imu.mag.y, 2)}
        z={fmt(imu.mag.z, 2)}
        vClass={magVC}
      />
      <div className="mt-1">
        <Row label="|B|" value={fmt(imu.mag.magnitude, 2)} unit="µT" vClass={magVC} />
      </div>

      {/* ── Topic labels ──────────────────────────────────── */}
      <div className="mt-3 space-y-0.5 border-t border-deck-line/40 pt-2">
        <p className="font-mono text-[8px] text-ink-low/50">
          {imu.topics.imu}
        </p>
        <p className="font-mono text-[8px] text-ink-low/50">
          {imu.topics.mag}
        </p>
      </div>
    </div>
  );
}
