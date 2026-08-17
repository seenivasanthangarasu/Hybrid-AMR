/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        deck: {
          950: '#0a0e14',
          900: '#0e131c',
          800: '#141b27',
          700: '#1b2433',
          600: '#26324533',
          line: '#243043',
        },
        signal: {
          amber: '#f5a623',
          cyan: '#3ddcff',
          green: '#37e29a',
          red: '#ff4d5e',
          violet: '#8c7bff',
        },
        ink: {
          high: '#eef2f8',
          mid: '#9fb0c6',
          low: '#5d6c84',
        },
      },
      fontFamily: {
        display: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px #243043, 0 8px 24px -8px rgba(0,0,0,0.6)',
        glow: '0 0 12px rgba(61,220,255,0.35)',
      },
      animation: {
        'pulse-slow': 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 3s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};
