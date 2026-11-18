/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // hover styles only on devices that can hover: avoids "stuck" hover highlights after a tap on iPhone/iPad
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // `touch:` variant = finger input (iPhone, iPad, Android): larger tap targets without changing the desktop layout
      screens: { touch: { raw: '(pointer: coarse)' } },
      colors: {
        bg: '#070B14',
        panel: '#101624',
        panel2: '#151D2F',
        line: '#1E2A40',
        cyan: '#00F5FF',
        magenta: '#FF00A8',
        ink: '#E2E8F0',
        muted: '#8492A6',
        ok: '#00E676',
        warn: '#FFB800',
        bad: '#FF4757',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
