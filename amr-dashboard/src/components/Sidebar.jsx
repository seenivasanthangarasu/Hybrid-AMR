import { useCallback, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Sidebar — the dashboard's single navigation surface, replacing the old
 * gear-icon popover (`SettingsMenu`, removed). It exists because GNSS
 * Quality and Nav2 Threshold Tuning used to be grid panels an operator had
 * to scroll below the fold to reach, and Data & Backups / Error Reference
 * lived in a second, separate popover — three different places to look for
 * "things that aren't the live views". Everything that isn't a live view now
 * opens from here.
 *
 * Layout controls (Edit layout, Reset) stay open after use — they're
 * in-place toggles, not navigation. Every other action opens a different
 * full-view page, so it closes the sidebar first (mirrors the old
 * SettingsMenu's behavior for Error Reference/Data & Backups).
 *
 * Built like `Dialog` (focus trap, Esc-to-close, backdrop-click-to-close,
 * `role="dialog"`/`aria-modal`) but slides in from the left edge instead of
 * centering, since it's a persistent navigation surface, not a message.
 */
function SidebarSectionLabel({ children }) {
  return (
    <p className="mb-1 mt-4 px-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-ink-mid first:mt-0">
      {children}
    </p>
  );
}

function SidebarItem({ icon, label, description, onClick, right }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-1.5 py-2 text-left transition-colors hover:bg-deck-800"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] font-semibold text-ink-high">{label}</span>
        {description && <span className="block truncate font-mono text-[9px] text-ink-low">{description}</span>}
      </span>
      {right}
    </button>
  );
}

export default function Sidebar({
  open,
  onClose,
  editMode,
  onToggleEdit,
  onResetLayout,
  onOpenGnssQuality,
  onOpenNav2Threshold,
  onOpenDataHandling,
  onOpenErrorReference,
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (open) restoreRef.current = document.activeElement;
  }, [open]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2500]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-deck-950/75 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.div
            ref={(node) => {
              panelRef.current = node;
              if (node) node.focus({ preventScroll: true });
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="panel absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto p-3 shadow-panel outline-none"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 id={titleId} className="font-display text-sm font-bold tracking-[0.1em] text-ink-high">
                MENU
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                title="Close (Esc)"
                className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-low transition-colors hover:bg-deck-800 hover:text-ink-high"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav aria-label="Dashboard navigation">
              <SidebarSectionLabel>DASHBOARD LAYOUT</SidebarSectionLabel>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={editMode}
                onClick={onToggleEdit}
                className="flex w-full items-center justify-between rounded px-1.5 py-2 text-left transition-colors hover:bg-deck-800"
              >
                <span className="flex flex-col">
                  <span className="font-mono text-[11px] font-semibold text-ink-high">Edit layout</span>
                  <span className="font-mono text-[9px] text-ink-low">drag &amp; resize panels</span>
                </span>
                <span
                  className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                    editMode ? 'bg-signal-cyan' : 'bg-deck-600'
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-0.5 h-3 w-3 rounded-full bg-deck-950"
                    style={{ left: editMode ? '14px' : '2px' }}
                  />
                </span>
              </button>

              <SidebarItem
                onClick={onResetLayout}
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-mid" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 12a9 9 0 109-9 9 9 0 00-6.7 3L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                }
                label="Reset to default"
              />

              <SidebarSectionLabel>PANELS</SidebarSectionLabel>
              <SidebarItem
                onClick={() => {
                  onClose?.();
                  onOpenGnssQuality?.();
                }}
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-mid" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                  </svg>
                }
                label="GNSS quality"
                description="fix quality, DOP, RF front-end"
              />
              <SidebarItem
                onClick={() => {
                  onClose?.();
                  onOpenNav2Threshold?.();
                }}
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-mid" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 6h16M4 12h10M4 18h13" />
                    <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" />
                    <circle cx="19" cy="18" r="1.6" fill="currentColor" stroke="none" />
                  </svg>
                }
                label="Nav2 threshold tuning"
                description="costmap/controller thresholds"
              />

              <SidebarSectionLabel>DATA</SidebarSectionLabel>
              <SidebarItem
                onClick={() => {
                  onClose?.();
                  onOpenDataHandling?.();
                }}
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-mid" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <ellipse cx="12" cy="5" rx="8" ry="3" />
                    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
                  </svg>
                }
                label="Data & backups"
                description="record topics & camera snapshots to disk"
              />

              <SidebarSectionLabel>HELP</SidebarSectionLabel>
              <SidebarItem
                onClick={() => {
                  onClose?.();
                  onOpenErrorReference?.();
                }}
                icon={
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-mid" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                }
                label="Error reference"
                description="what each fault state means"
              />
            </nav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
