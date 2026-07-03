export default function NoDataBadge({ label = 'NO DATA', className = '' }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-1 ${className}`}>
      <div className="h-1.5 w-1.5 rounded-full bg-ink-low" />
      <span className="no-data text-[11px]">{label}</span>
    </div>
  );
}
