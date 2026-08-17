interface CircularGaugeProps {
  value: number
  maxValue?: number
  size?: number
  strokeWidth?: number
  label?: string
  color?: string
  bgColor?: string
  showPercentage?: boolean
}

const GAUGE_COLORS = {
  excellent: '#16A34A',
  good: '#2563EB',
  fair: '#D97706',
  poor: '#DC2626',
} as const

export function getCircularGaugeColor(value: number): string {
  if (value > 60) return GAUGE_COLORS.excellent
  if (value > 30) return GAUGE_COLORS.good
  if (value > 15) return GAUGE_COLORS.fair
  return GAUGE_COLORS.poor
}

export function CircularGauge({ value, maxValue = 100, size = 80, strokeWidth = 6, label, color, bgColor, showPercentage = true }: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(value / maxValue, 1)
  const offset = circumference * (1 - progress)
  const gaugeColor = color ?? getCircularGaugeColor(value)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={bgColor ?? '#E2E8F0'} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={gaugeColor} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            {showPercentage && <span className="text-lg font-bold leading-none">{Math.round(value)}%</span>}
            {label && <span className="text-xs text-text-secondary block mt-0.5">{label}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
