/** @type {import('tailwindcss').Config} */

// Colors are driven by CSS custom properties (see src/index.css) so the whole
// UI can switch between dark (default) and light themes. Each token holds
// space-separated RGB *channels* (e.g. `--deck-950: 10 14 20`) so Tailwind's
// `<alpha-value>` opacity modifiers (bg-signal-green/15, ring-signal-cyan/40,
// bg-deck-950/80, …) keep working across both themes.
const withVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        deck: {
          950: withVar('deck-950'),
          900: withVar('deck-900'),
          800: withVar('deck-800'),
          700: withVar('deck-700'),
          600: withVar('deck-600'),
          line: withVar('deck-line'),
        },
        signal: {
          amber: withVar('signal-amber'),
          cyan: withVar('signal-cyan'),
          green: withVar('signal-green'),
          red: withVar('signal-red'),
          violet: withVar('signal-violet'),
        },
        ink: {
          high: withVar('ink-high'),
          mid: withVar('ink-mid'),
          low: withVar('ink-low'),
        },
      },
      fontFamily: {
        display: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        // Ring + ambient shadow both reference theme vars so panels read
        // correctly on light surfaces (a fixed dark ring looked wrong there).
        panel: '0 0 0 1px rgb(var(--deck-line)), 0 8px 24px -8px rgb(var(--shadow) / 0.55)',
        glow: '0 0 12px rgb(var(--signal-cyan) / 0.35)',
      },
      animation: {
        'pulse-slow': 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 3s linear infinite',
        // Drives the visible e-stop confirm-window countdown (spec REQ-17).
        'estop-countdown': 'estop-countdown 3s linear forwards',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'estop-countdown': {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
      },
    },
  },
  plugins: [],
};
