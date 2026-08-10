import { motion } from 'framer-motion';
import useRosConnection from '../hooks/useRosConnection.js';
import useNow from '../hooks/useNow.js';
import { formatAge } from '../utils/freshness.js';
import { toneFor } from './ui/signalTones.js';

/**
 * DataFallback (spec REQ-20) — a single fallback treatment that distinguishes
 * *why* data is absent instead of an undifferentiated "NO DATA — /topic":
 *   OFFLINE    — no ROS link (disconnected/error/closed)
 *   CONNECTING — link negotiating
 *   NO SIGNAL  — linked, but the topic has never published
 *   STALE      — was live, now overdue (with age)
 *
 * The state animates in and the tone dot emits a slow radar "ping" ring so an
 * absent-data panel reads clearly at a glance without being noisy. All motion
 * is gated by the app-level `MotionConfig reducedMotion="user"`.
 * For non-ROS sources (e.g. the HTTP camera stream) pass an explicit
 * `label`/`tone` to skip the ROS-link derivation.
 */
function resolveCause({ connectionStatus, hasEverData, ageSec }) {
  if (connectionStatus === 'connecting') return { label: 'CONNECTING', tone: 'warn', pulse: true };
  if (connectionStatus !== 'connected') return { label: 'OFFLINE', tone: 'critical', pulse: false };
  if (!hasEverData) return { label: 'NO SIGNAL', tone: 'idle', pulse: false };
  return { label: ageSec != null ? `STALE · ${formatAge(ageSec)}` : 'STALE', tone: 'stale', pulse: false };
}

export default function DataFallback({
  topic,
  hasEverData = false,
  lastReceivedAt = null,
  label,
  tone = 'idle',
  pulse = false,
  className = '',
}) {
  const { status } = useRosConnection();
  const now = useNow(1000);

  let cause;
  if (label != null) {
    cause = { label, tone, pulse };
  } else {
    const ageSec = lastReceivedAt ? Math.max(0, Math.round((now - lastReceivedAt) / 1000)) : null;
    cause = resolveCause({ connectionStatus: status, hasEverData, ageSec });
  }

  const t = toneFor(cause.tone);

  return (
    <motion.div
      key={cause.label}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={`flex h-full w-full flex-col items-center justify-center gap-2 ${className}`}
    >
      {/* Tone dot with an expanding radar ping to draw the eye. */}
      <span className="relative flex h-2.5 w-2.5 items-center justify-center">
        <motion.span
          className={`absolute inline-flex h-full w-full rounded-full ${t.dot}`}
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 3 }}
          transition={{ duration: 2, ease: 'easeOut', repeat: Infinity }}
        />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
      </span>

      <motion.span
        initial={{ letterSpacing: '0.25em', opacity: 0 }}
        animate={{ letterSpacing: '0.14em', opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`font-mono text-[11px] font-semibold ${t.text}`}
      >
        {cause.label}
      </motion.span>

      {topic && <span className="no-data text-[10px]">{topic}</span>}
    </motion.div>
  );
}
