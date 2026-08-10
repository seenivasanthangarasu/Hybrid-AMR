import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Header settings control: a gear button that opens a small popover for
 * dashboard customization — toggle layout-edit mode (drag/resize panels) and
 * reset the layout to the shipped default. Closes on outside-click or Escape.
 */
export default function SettingsMenu({ editMode, onToggleEdit, onReset }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Dashboard settings"
        title="Dashboard settings"
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          open || editMode
            ? 'border-signal-cyan/50 bg-signal-cyan/10 text-signal-cyan'
            : 'border-deck-line text-ink-mid hover:border-ink-low hover:text-ink-high'
        }`}
      >
        <motion.svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="panel absolute right-0 top-9 z-[2000] w-60 origin-top-right rounded-md p-2 shadow-panel"
          >
            <p className="px-1.5 pb-1.5 pt-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-ink-mid">
              DASHBOARD LAYOUT
            </p>

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
              {/* Toggle switch */}
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

            <button
              type="button"
              role="menuitem"
              onClick={onReset}
              className="mt-0.5 flex w-full items-center gap-2 rounded px-1.5 py-2 text-left font-mono text-[11px] font-semibold text-ink-mid transition-colors hover:bg-deck-800 hover:text-signal-red"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 12a9 9 0 109-9 9 9 0 00-6.7 3L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset to default
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
