/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary palette
        bg: { DEFAULT: '#FFFFFF', secondary: '#F8FAFC', tertiary: '#F1F5F9', elevated: '#FFFFFF' },
        text: { primary: '#0F172A', secondary: '#475569', muted: '#94A3B8', placeholder: '#CBD5E1' },
        border: { DEFAULT: '#E2E8F0', light: '#F1F5F9' },
        accent: { DEFAULT: '#0EA5E9', hover: '#0284C7', active: '#0369A1' },
        brand: { DEFAULT: '#1D4ED8', hover: '#1E40AF', light: '#DBEAFE' },

        // Status colors
        success: { DEFAULT: '#16A34A', bg: '#F0FDF4', muted: '#BBF7D0' },
        info:    { DEFAULT: '#2563EB', bg: '#EFF6FF', muted: '#BFDBFE' },
        warning: { DEFAULT: '#D97706', bg: '#FFFBEB', muted: '#FDE68A' },
        error:   { DEFAULT: '#DC2626', bg: '#FEF2F2', muted: '#FECACA' },

        // Extended neutrals
        sidebar: '#FAFBFC',
        footer: '#F8FAFC',
        overlay: 'rgba(15, 23, 42, 0.15)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: { lg: '12px', md: '8px', sm: '6px' },
      boxShadow: { card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)', soft: '0 2px 8px rgba(15, 23, 42, 0.08)' },
      spacing: { '18': '4.5rem', '72': '18rem', '84': '21rem', '96': '24rem' },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
