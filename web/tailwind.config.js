/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#08090c',
          900: '#0d0f14',
          850: '#12141b',
          800: '#181b24',
          700: '#22262f',
        },
        pulse: {
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
        },
        ember: {
          300: '#fcd34d',
          400: '#fbbf24',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'reveal': 'reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-dot': 'pulse-dot 2.4s ease-in-out infinite',
        'drift': 'drift 22s ease-in-out infinite alternate',
      },
      keyframes: {
        reveal: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' },
        },
        drift: {
          '0%': { transform: 'translate3d(0,0,0) scale(1)' },
          '100%': { transform: 'translate3d(-4%, 3%, 0) scale(1.12)' },
        },
      },
    },
  },
  plugins: [],
};
