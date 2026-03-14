/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#050709',
          900: '#0d0f14',
          800: '#141720',
          700: '#1c202e',
          600: '#252a3a',
          500: '#2e3447',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgb(6 182 212 / 0.5)' },
          '100%': { boxShadow: '0 0 20px rgb(6 182 212 / 0.8), 0 0 40px rgb(6 182 212 / 0.4)' },
        },
      },
    },
  },
  plugins: [],
}

