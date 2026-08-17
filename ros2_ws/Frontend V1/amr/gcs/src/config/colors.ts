/**
 * Color tokens matching the design specification.
 * All components reference these — never use arbitrary color values.
 */

export const COLORS = {
  // Primary palette
  bg:            '#FFFFFF',
  bgSecondary:   '#F8FAFC',
  bgTertiary:    '#F1F5F9',
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  border:        '#E2E8F0',
  accent:        '#0EA5E9',
  accentHover:   '#0284C7',
  brand:         '#1D4ED8',
  brandHover:    '#1E40AF',

  // Status colors
  success:       '#16A34A',
  successBg:     '#F0FDF4',
  info:          '#2563EB',
  infoBg:        '#EFF6FF',
  warning:       '#D97706',
  warningBg:     '#FFFBEB',
  error:         '#DC2626',
  errorBg:       '#FEF2F2',

  // Map path colors
  pathPending:   '#0EA5E9',
  pathCompleted: '#16A34A',
  pathActive:    '#D97706',
  pathError:     '#DC2626',

  // LiDAR gradient
  lidarNear:     '#DC2626',   // < 1m red
  lidarMid:      '#D97706',   // 1-3m orange
  lidarFar:      '#16A34A',   // > 3m green

  // GPS signal colors
  gpsExcellent:  '#16A34A',
  gpsGood:       '#2563EB',
  gpsFair:       '#D97706',
  gpsPoor:       '#DC2626',

  // Utility
  white:         '#FFFFFF',
  black:         '#000000',
  transparent:   'transparent',
} as const

export type ColorKey = keyof typeof COLORS

/** Convert a color key to a hex string */
export function getColor(key: ColorKey): string {
  return COLORS[key]
}
