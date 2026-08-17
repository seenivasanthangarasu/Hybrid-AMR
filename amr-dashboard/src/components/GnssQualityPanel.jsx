import useGnssQuality from '../hooks/useGnssQuality.js';
import useNow from '../hooks/useNow.js';
import PanelHeader from './ui/PanelHeader.jsx';
import FreshnessBadge from './ui/FreshnessBadge.jsx';
import DataFallback from './DataFallback.jsx';
import { toneFor } from './ui/signalTones.js';
import { classifyFreshness } from '../utils/freshness.js';
import {
  CNO_MAX,
  CNO_STRONG,
  SAT_MIN_3D,
  cnoQuality,
  dopQuality,
  fixed,
  formatDistance,
  satCountQuality,
} from '../utils/gnss.js';

/**
 * GnssQualityPanel — the fix-quality readout that /fix alone cannot give.
 *
 * Five independently-sourced blocks: SOLUTION (u-blox NavPVT + NavSTATUS),
 * ACCURACY (NavPVT estimates + radii derived from the NavSatFix covariance),
 * GEOMETRY (NavDOP), SIGNAL (NavSAT per-satellite C/N0) and RF FRONT-END
 * (MonHW). Each block owns its freshness badge and its own NO DATA fallback,
 * because the driver publishes each message only when the matching
 * `publish.*` option is enabled — a half-configured receiver must show the
 * half it does publish rather than an empty panel.
 *
 * Nothing here is ever synthesised: an absent field renders NO DATA, and a
 * covariance the driver marked UNKNOWN yields no CEP/R95 at all rather than
 * a confident 0.00 m.
 */

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function Block({ title, freshness, topic, children, className = '' }) {
  const empty = freshness?.state === 'NO_DATA';
  return (
    <section className={`flex min-w-0 flex-col rounded bg-deck-900/50 p-2 ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="data-label truncate">{title}</h4>
        <FreshnessBadge freshness={freshness} />
      </div>
      {empty ? (
        <div className="flex min-h-[3.5rem] flex-1 items-center justify-center">
          <DataFallback topic={topic} hasEverData={false} />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** One label/value pair. `value == null` renders NO DATA, never a zero. */
function Stat({ label, value, unit, tone, title, dim = false }) {
  const toneClass = tone ? toneFor(tone).text : 'text-ink-high';
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <span className="data-label truncate">{label}</span>
      {value == null || value === '' ? (
        <span className="no-data shrink-0 text-[10px]">NO DATA</span>
      ) : (
        <span className={`data-value shrink-0 text-xs font-semibold ${toneClass} ${dim ? 'opacity-70' : ''}`}>
          {value}
          {unit && <span className="ml-0.5 text-[10px] font-normal text-ink-low">{unit}</span>}
        </span>
      )}
    </div>
  );
}

/** Horizontal meter for a 0–100% quantity (AGC, jamming). */
function Meter({ percent, tone = 'info' }) {
  const t = toneFor(tone);
  const width = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-deck-line/60">
      <div className={`h-full rounded-full ${t.dot} transition-[width] duration-300`} style={{ width: `${width}%` }} />
    </div>
  );
}

function distanceStat(metres) {
  const d = formatDistance(metres);
  return d ? { value: d.value, unit: d.unit } : { value: null, unit: undefined };
}

// ---------------------------------------------------------------------------
// Satellite C/N0 chart
// ---------------------------------------------------------------------------
// The classic receiver signal view: one vertical bar per satellite, height ∝
// C/N0, sorted strongest-first. Satellites contributing to the solution are
// drawn solid; tracked-but-unused ones are dimmed, so "12 visible / 8 used"
// is legible as a shape rather than only as a number.
function CnoChart({ satellites }) {
  if (!satellites.length) {
    return <p className="no-data py-4 text-center text-[10px]">NO SATELLITES REPORTED</p>;
  }
  return (
    <div className="flex min-h-[4.5rem] flex-1 items-end gap-[3px] overflow-x-auto pb-0.5">
      {satellites.map((s) => {
        const q = cnoQuality(s.cno);
        const height = s.cno == null ? 0 : Math.min(100, (s.cno / CNO_MAX) * 100);
        return (
          <div
            key={`${s.gnssId}-${s.svId}`}
            className="flex h-full min-w-[13px] flex-1 flex-col items-center justify-end gap-0.5"
            title={`${s.constellation} ${s.svId} · ${s.cno ?? '–'} dB-Hz · ${
              s.used ? 'used in solution' : 'not used'
            }${s.elevation != null ? ` · el ${s.elevation}°` : ''}${
              s.azimuth != null ? ` · az ${s.azimuth}°` : ''
            }${s.diffCorr ? ' · diff corr' : ''}`}
          >
            <span className="font-mono text-[8px] leading-none text-ink-low">{s.cno ?? ''}</span>
            <div
              className={`w-full rounded-sm ${toneFor(q.tone).dot} ${s.used ? '' : 'opacity-35'}`}
              style={{ height: `${Math.max(height, 2)}%` }}
            />
            <span className="font-mono text-[8px] leading-none text-ink-low">{s.svId}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export default function GnssQualityPanel() {
  const now = useNow(1000);
  const g = useGnssQuality();

  const fresh = Object.fromEntries(
    Object.entries(g.timing).map(([key, t]) => [key, classifyFreshness(t, now)]),
  );

  // The headline: horizontal accuracy, preferring the receiver's own estimate
  // over anything reconstructed from the covariance.
  const headline = g.estimated?.horizontal ?? g.derived?.sigmaH ?? null;
  const headlineSource = g.estimated?.horizontal != null ? 'hAcc · NavPVT' : g.derived ? 'σH · covariance' : null;
  const hdopQ = dopQuality(g.dop?.hdop);
  const pdopQ = dopQuality(g.pdop);
  // Count and geometry are the two halves of the accuracy story, so the
  // satellite count carries the same rating vocabulary as DOP. NavPVT's numSV
  // is authoritative; NavSAT's used-count stands in when only that is enabled.
  const satsUsed = g.solution?.satellitesUsed ?? g.sats?.used ?? null;
  const satQ = satCountQuality(satsUsed);

  const rtkTone =
    g.solution?.carrierSolutionCode === 2 ? 'live' : g.solution?.carrierSolutionCode === 1 ? 'warn' : 'idle';

  return (
    <div className="panel flex h-full flex-col overflow-auto rounded-md p-3 shadow-panel">
      <PanelHeader
        title="GNSS QUALITY"
        right={
          <div className="flex items-center gap-2">
            {satsUsed != null && (
              <span
                className={`font-mono text-[10px] ${toneFor(satQ.tone).text}`}
                title={`${satsUsed} satellites used in the solution${satQ.label ? ` — ${satQ.label}` : ''}`}
              >
                {satsUsed} SAT
              </span>
            )}
            {headline != null && (
              <span className="font-mono text-[10px] text-ink-low" title={`source: ${headlineSource}`}>
                ±{formatDistance(headline).value}
                {formatDistance(headline).unit}
              </span>
            )}
            <FreshnessBadge freshness={fresh.fix} />
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2">
        {/* ---------------- SOLUTION ---------------- */}
        <Block title="SOLUTION" freshness={fresh.pvt} topic={g.topics.pvt}>
          <div className="flex flex-col gap-1">
            <Stat
              label="Fix type"
              value={g.solution?.fixType}
              tone={g.solution?.fixTypeCode >= 3 ? 'live' : g.solution?.fixTypeCode >= 2 ? 'warn' : 'critical'}
              title="NavPVT.fixType — 3D FIX is the normal healthy state"
            />
            <Stat
              label="Fix valid"
              value={g.solution?.fixOk == null ? null : g.solution.fixOk ? 'YES' : 'NO'}
              tone={g.solution?.fixOk ? 'live' : 'critical'}
              title="gnssFixOK — the receiver's own validity flag for this solution"
            />
            <Stat
              label="RTK"
              value={g.solution?.carrierSolution}
              tone={rtkTone}
              title="Carrier-phase solution: NONE / RTK FLOAT / RTK FIXED"
            />
            <Stat
              label="Differential"
              value={g.solution?.differential == null ? null : g.solution.differential ? 'APPLIED' : 'NONE'}
              tone={g.solution?.differential ? 'live' : 'idle'}
              title="diffSoln — DGPS/SBAS/RTCM corrections applied to this fix"
            />
            <Stat
              label="Sats used"
              value={
                g.solution?.satellitesUsed == null
                  ? null
                  : satQ.label
                    ? `${g.solution.satellitesUsed} · ${satQ.label}`
                    : g.solution.satellitesUsed
              }
              tone={satQ.tone}
              title={`numSV — satellites contributing to the navigation solution. ${SAT_MIN_3D} is the minimum for a 3D fix, with no redundancy.`}
            />
            <Stat
              label="UTC"
              value={g.solution?.utc?.text}
              tone={g.solution?.utc?.resolved ? 'live' : 'warn'}
              dim={g.solution?.utc?.resolved === false}
              title="NavPVT UTC time; dimmed until the receiver reports it fully resolved"
            />
            <Stat
              label="TTFF"
              value={fixed(g.receiver?.ttffSec, 1)}
              unit="s"
              title="Time to first fix since receiver start (NavSTATUS.ttff)"
            />
            <Stat
              label="Constellations"
              value={g.fix.constellations?.length ? g.fix.constellations.join(' ') : null}
              title="NavSatFix.status.service bitmask"
            />
          </div>
        </Block>

        {/* ---------------- ACCURACY ---------------- */}
        <Block title="ACCURACY" freshness={fresh.fix} topic={g.topics.fix}>
          <div className="flex flex-col gap-1">
            <Stat
              label="hAcc (1σ)"
              {...distanceStat(g.estimated?.horizontal)}
              tone="info"
              title="Receiver's own horizontal accuracy estimate, NavPVT.hAcc"
            />
            <Stat
              label="vAcc (1σ)"
              {...distanceStat(g.estimated?.vertical)}
              title="Receiver's own vertical accuracy estimate, NavPVT.vAcc"
            />
            <div className="my-0.5 border-t border-deck-line/60" />
            <Stat
              label="CEP (50%)"
              {...distanceStat(g.derived?.cep50)}
              title="Circular error probable — radius containing 50% of fixes. Derived from position_covariance as 1.1774·σ, not a transmitted field."
            />
            <Stat
              label="R95 (95%)"
              {...distanceStat(g.derived?.r95)}
              title="Radius containing 95% of fixes — 2.4477·σ"
            />
            <Stat label="DRMS" {...distanceStat(g.derived?.drms)} title="√(σE² + σN²) — about 65% confidence" />
            <Stat label="2DRMS" {...distanceStat(g.derived?.twoDrms)} title="Twice DRMS — about 95–98% confidence" />
            <div className="my-0.5 border-t border-deck-line/60" />
            <Stat label="σ East" {...distanceStat(g.derived?.sigmaE)} />
            <Stat label="σ North" {...distanceStat(g.derived?.sigmaN)} />
            <Stat label="σ Up" {...distanceStat(g.derived?.sigmaU)} />
            <Stat
              label="Covariance"
              value={g.fix.covarianceTypeLabel}
              dim
              title="position_covariance_type — UNKNOWN means the driver published no covariance, so the radii above are unavailable"
            />
          </div>
        </Block>

        {/* ---------------- GEOMETRY (DOP) ---------------- */}
        <Block title="GEOMETRY · DOP" freshness={fresh.dop} topic={g.topics.dop}>
          <div className="flex flex-col gap-1">
            {/* HDOP is the one operators quote, so it gets the hero treatment. */}
            <div className="mb-1 rounded bg-deck-950/50 p-1.5">
              <div className="flex items-baseline justify-between">
                <span className="data-label">HDOP</span>
                <span className={`data-value text-lg font-bold leading-none ${toneFor(hdopQ.tone).text}`}>
                  {fixed(g.dop?.hdop, 2) ?? <span className="no-data text-xs">—</span>}
                </span>
              </div>
              {hdopQ.label && (
                <div className={`mt-0.5 text-right font-mono text-[9px] tracking-wider ${toneFor(hdopQ.tone).text}`}>
                  {hdopQ.label}
                </div>
              )}
            </div>
            <Stat
              label="PDOP"
              value={fixed(g.pdop, 2)}
              tone={pdopQ.tone}
              title={`Position DOP${g.pdopSource ? ` (from ${g.pdopSource})` : ''}`}
            />
            <Stat label="VDOP" value={fixed(g.dop?.vdop, 2)} title="Vertical dilution of precision" />
            <Stat label="GDOP" value={fixed(g.dop?.gdop, 2)} title="Geometric DOP — includes the time component" />
            <Stat label="TDOP" value={fixed(g.dop?.tdop, 2)} title="Time dilution of precision" />
            <Stat label="NDOP" value={fixed(g.dop?.ndop, 2)} title="Northing DOP" />
            <Stat label="EDOP" value={fixed(g.dop?.edop, 2)} title="Easting DOP" />
            <p className="mt-1 font-mono text-[9px] leading-tight text-ink-low">
              Unitless geometry multiplier — position error ≈ DOP × ranging error.
            </p>
          </div>
        </Block>

        {/* ---------------- SIGNAL (C/N0) ---------------- */}
        <Block title="SIGNAL · C/N0" freshness={fresh.sat} topic={g.topics.sat} className="lg:col-span-2">
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="grid grid-cols-4 gap-1.5">
              <Stat label="Visible" value={g.sats?.visible} title="Satellites the receiver is aware of" />
              <Stat
                label="Used"
                value={g.sats?.used}
                tone={satCountQuality(g.sats?.used).tone}
                title="Satellites contributing to the solution — the count that determines accuracy"
              />
              <Stat
                label="Mean"
                value={fixed(g.sats?.meanCno, 1)}
                unit="dB-Hz"
                tone={cnoQuality(g.sats?.meanCno).tone}
              />
              <Stat
                label={`≥${CNO_STRONG}`}
                value={g.sats?.strongCount}
                title={`Satellites at or above ${CNO_STRONG} dB-Hz — a clean open-sky signal`}
              />
            </div>

            <CnoChart satellites={g.sats?.satellites ?? []} />

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-deck-line/60 pt-1">
              {g.sats?.constellations?.map((c) => (
                <span key={c.name} className="font-mono text-[9px] text-ink-low">
                  {c.name} <span className="text-ink-mid">{c.used}</span>/{c.visible}
                </span>
              ))}
            </div>
            <p className="font-mono text-[9px] leading-tight text-ink-low">
              Carrier-to-noise density per satellite (not RSSI — a GNSS signal sits below the noise floor). Solid bars
              are used in the solution.
            </p>
          </div>
        </Block>

        {/* ---------------- RF FRONT-END ---------------- */}
        <Block title="RF FRONT-END" freshness={fresh.hw} topic={g.topics.hw}>
          <div className="flex flex-col gap-1.5">
            <Stat
              label="Antenna"
              value={g.rf?.antennaStatus}
              tone={g.rf?.antennaTone}
              title="MonHW.aStatus — SHORT or OPEN means a cabling or antenna fault"
            />
            <Stat
              label="Jamming"
              value={g.rf?.jammingState}
              tone={g.rf?.jammingTone}
              title="MonHW jamming state — CRITICAL means interference is degrading every satellite at once"
            />

            <div>
              <Stat
                label="Jam indicator"
                value={g.rf?.jamIndicator}
                unit="/255"
                title="Broadband interference level, 0 = quiet"
              />
              <Meter percent={g.rf?.jamPercent} tone={g.rf?.jammingTone ?? 'info'} />
            </div>

            <div>
              <Stat label="AGC" value={fixed(g.rf?.agcPercent, 0)} unit="%" title="Automatic gain control, 0–8191" />
              <Meter percent={g.rf?.agcPercent} tone="info" />
            </div>

            <Stat label="Noise" value={g.rf?.noisePerMs} title="MonHW.noisePerMS — front-end noise level" />
            <div className="my-0.5 border-t border-deck-line/60" />
            <Stat
              label="Height (MSL)"
              value={fixed(g.solution?.heightMsl, 1)}
              unit="m"
              title="Height above mean sea level"
            />
            <Stat
              label="Height (ellip.)"
              value={fixed(g.solution?.heightEllipsoid, 1)}
              unit="m"
              title="Height above the WGS-84 ellipsoid"
            />
            <Stat
              label="Geoid sep."
              value={fixed(g.solution?.geoidSeparation, 1)}
              unit="m"
              title="Ellipsoid − MSL: the offset that makes GPS altitude disagree with a map"
            />
            <Stat label="Speed acc." value={fixed(g.estimated?.speed, 2)} unit="m/s" title="NavPVT.sAcc" />
            <Stat label="Heading acc." value={fixed(g.estimated?.heading, 1)} unit="deg" title="NavPVT.headAcc" />
          </div>
        </Block>
      </div>
    </div>
  );
}
