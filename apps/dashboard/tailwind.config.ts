import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0e14',
        panel: '#11161f',
        edge: '#1e2733',
      },
    },
  },
  plugins: [],
} satisfies Config;
