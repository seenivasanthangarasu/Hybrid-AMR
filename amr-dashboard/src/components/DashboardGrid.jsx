import { useLayoutEffect, useRef, useState } from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const Grid = WidthProvider(GridLayout);

const COLS = 12;
const MARGIN = 12;
const BASE_ROWS = 12; // default layout is 12 rows tall → fills one screen

/**
 * The draggable/resizable dashboard surface (react-grid-layout). Panels move
 * "anywhere to anywhere" and resize freely when `editMode` is on; when off the
 * grid is locked and widgets behave normally. rowHeight is derived from the
 * live container height so the default 12-row layout fills the viewport instead
 * of being a fixed pixel guess; taller custom layouts scroll.
 */
export default function DashboardGrid({ layout, onLayoutChange, editMode, children }) {
  const containerRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(64);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const compute = () => {
      const h = el.clientHeight;
      setRowHeight(Math.max(24, Math.floor((h - (BASE_ROWS + 1) * MARGIN) / BASE_ROWS)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      <Grid
        className="layout"
        layout={layout}
        cols={COLS}
        rowHeight={rowHeight}
        margin={[MARGIN, MARGIN]}
        containerPadding={[0, 0]}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".panel-drag-handle"
        draggableCancel=".react-resizable-handle"
        // Rearrangement semantics. The previous `compactType={null}` +
        // `preventCollision={false}` was the one combination that lets panels
        // occupy the SAME cells — dropping one onto another stacked them, so a
        // panel silently vanished underneath its neighbour, and dragging away
        // left an un-fillable hole. Vertical compaction makes a drop *displace*
        // the panels it lands on and settle everything upward: no overlap, no
        // orphan gaps, and the shipped default layout is already fully packed
        // so it renders identically.
        compactType="vertical"
        preventCollision={false}
        onLayoutChange={onLayoutChange}
        useCSSTransforms
      >
        {children}
      </Grid>
    </div>
  );
}
