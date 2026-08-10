/**
 * Consistent panel title (spec REQ-17 usability). Replaces the hand-rolled
 * <h3 class="font-display text-[11px]…"> repeated across every panel, with an
 * optional right-slot (e.g. a freshness badge or count).
 */
export default function PanelHeader({ title, right, className = '' }) {
  return (
    <div className={`mb-2 flex items-center justify-between ${className}`}>
      <h3 className="font-display text-[11px] font-bold tracking-[0.14em] text-ink-mid">{title}</h3>
      {right}
    </div>
  );
}
