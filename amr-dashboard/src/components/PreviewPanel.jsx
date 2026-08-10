import { motion } from 'framer-motion';

const BASE = 'group relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md text-left';

// "Live in main view" badge — pulsing cyan dot + label so the active preview
// is unmistakable at a glance.
function ActiveBadge() {
  return (
    <span className="flex items-center gap-1 rounded bg-signal-cyan/15 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-signal-cyan">
      <motion.span
        className="inline-block h-1.5 w-1.5 rounded-full bg-signal-cyan"
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      LIVE IN MAIN
    </span>
  );
}

/**
 * A right-rail preview. Clickable variants switch the main view and carry a
 * "Click to show in main view" affordance hint. The ACTIVE one (shown in the
 * main view) gets ONE standardized highlight, identical on every preview: an
 * inset cyan border + a glowing gradient top bar + a cyan title + a
 * "LIVE IN MAIN" badge. Inset/inside so the grid cell's overflow-hidden can't
 * clip it, and no shared layout animation so it never flies between panels.
 * Set `interactive={false}` for cards that do nothing on click (e.g. the URDF
 * robot model) — they render as a static <div>, not a <button> (spec REQ-19).
 */
export default function PreviewPanel({ title, active, onClick, children, badge, interactive = true }) {
  if (!interactive) {
    return (
      <div
        className={`${BASE} shadow-panel ring-1 ring-inset ring-deck-line`}
        title={`${title} — not a selectable view`}
      >
        <div className="flex items-center justify-between bg-deck-800 px-2.5 py-1.5">
          <span className="data-label">{title}</span>
          {badge ?? (
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-low">
              not a selectable view
            </span>
          )}
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to show in main view"
      className={`${BASE} transition-[box-shadow,--tw-ring-color] duration-200 ${
        active ? 'ring-2 ring-inset ring-signal-cyan' : 'ring-1 ring-inset ring-deck-line hover:ring-ink-low'
      }`}
    >
      {/* Standardized active marker: a glowing gradient bar across the very top,
          fading in — same on every active preview, no cross-panel motion. */}
      {active && (
        <motion.span
          key="active-accent"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-[3px] bg-gradient-to-r from-signal-cyan/30 via-signal-cyan to-signal-cyan/30 shadow-glow"
        />
      )}
      <div className="flex items-center justify-between bg-deck-800 px-2.5 py-1.5">
        <span className={`data-label ${active ? 'text-signal-cyan' : ''}`}>{title}</span>
        {active ? <ActiveBadge /> : badge}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
      {!active && (
        <div className="pointer-events-none absolute inset-0 bg-deck-950/0 transition-colors group-hover:bg-deck-950/10" />
      )}
    </button>
  );
}
