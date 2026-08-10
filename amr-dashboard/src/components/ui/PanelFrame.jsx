/**
 * Wraps a dashboard widget as a react-grid-layout cell. In normal use it's a
 * transparent full-size container (the widget keeps its own styling). In
 * layout-edit mode it overlays a drag surface carrying the `panel-drag-handle`
 * class — react-grid-layout's `draggableHandle` targets exactly this, so a
 * press anywhere on the panel starts a move, while it also shields the widget's
 * own controls. Kept as a plain element (no motion wrapper) so nothing can sit
 * between the pointer and react-draggable's handler. The resize handle RGL
 * appends sits above this overlay (higher z-index) and is excluded from
 * dragging via `draggableCancel`.
 */
export default function PanelFrame({ title, editMode = false, children }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {children}

      {editMode && (
        <div className="panel-drag-handle absolute inset-0 z-[1100] flex cursor-grab select-none flex-col items-center justify-center gap-1.5 rounded-md bg-deck-950/55 outline outline-2 outline-dashed -outline-offset-2 outline-signal-cyan/60 active:cursor-grabbing">
          <span className="flex items-center gap-1.5 rounded bg-deck-900/90 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-signal-cyan ring-1 ring-signal-cyan/40">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" stroke="none">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
            {title}
          </span>
          <span className="font-mono text-[9px] tracking-wider text-ink-mid">
            drag to move · corner to resize
          </span>
        </div>
      )}
    </div>
  );
}
