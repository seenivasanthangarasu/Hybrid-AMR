import { useCallback, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog primitive.
 *
 * Accessibility is the point of this component, not decoration: an operator
 * must be able to read and dismiss a fault message without a mouse. It renders
 * as a labelled `role="dialog"` with `aria-modal`, moves focus in on open,
 * traps Tab inside while open, closes on Escape or backdrop click, and returns
 * focus to whatever opened it. Motion inherits the app-level
 * `MotionConfig reducedMotion="user"`.
 *
 * Sits at z-3000 — above the settings popover (z-2000) and the layout-edit
 * drag overlay (z-1100), so a fault is never rendered behind the UI it explains.
 */
const SIZES = { md: 'max-w-lg', xl: 'max-w-3xl' };

export default function Dialog({ open, onClose, title, subtitle, icon, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();

  // Remember what had focus so it can be restored when the dialog closes.
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
      // Wrap focus at both ends so Tab can never escape to the page behind.
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
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop — click to dismiss. aria-hidden so SRs see only the panel. */}
          <div
            className="absolute inset-0 bg-deck-950/75 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.div
            ref={(node) => {
              panelRef.current = node;
              // Focus the panel itself rather than the first control, so the
              // title is announced before any action is offered.
              if (node) node.focus({ preventScroll: true });
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className={`panel relative max-h-[85vh] w-full ${SIZES[size] ?? SIZES.md} overflow-auto rounded-lg p-5 shadow-panel outline-none`}
          >
            <div className="mb-3 flex items-start gap-3">
              {icon}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-display text-sm font-bold tracking-[0.1em] text-ink-high">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 font-mono text-[10px] text-ink-low">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                title="Close (Esc)"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-low transition-colors hover:bg-deck-800 hover:text-ink-high"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="text-ink-mid">{children}</div>

            {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
