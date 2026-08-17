export default function PreviewPanel({ title, active, onClick, children, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-40 w-full flex-col overflow-hidden rounded-md text-left transition-all ${
        active ? 'shadow-glow ring-1 ring-signal-cyan' : 'shadow-panel ring-1 ring-deck-line hover:ring-ink-low'
      }`}
    >
      <div className="flex items-center justify-between bg-deck-800 px-2.5 py-1.5">
        <span className="data-label">{title}</span>
        {badge}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
      {!active && (
        <div className="pointer-events-none absolute inset-0 bg-deck-950/0 transition-colors group-hover:bg-deck-950/10" />
      )}
    </button>
  );
}
