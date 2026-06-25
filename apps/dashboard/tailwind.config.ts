import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#06080f',
        base: '#080b14',
        panel: '#0d1322',
        panel2: '#101829',
        edge: '#1c2740',
        accent: '#6366f1',
        accent2: '#8b5cf6',
        flow: '#22d3ee',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99,102,241,0.25), 0 8px 30px -8px rgba(99,102,241,0.35)',
        'glow-cyan': '0 0 18px -2px rgba(34,211,238,0.55), 0 0 0 1px rgba(34,211,238,0.4)',
        'glow-emerald': '0 0 18px -2px rgba(16,185,129,0.55), 0 0 0 1px rgba(16,185,129,0.45)',
        'glow-rose': '0 0 18px -2px rgba(244,63,94,0.6), 0 0 0 1px rgba(244,63,94,0.5)',
        'glow-amber': '0 0 18px -2px rgba(245,158,11,0.6), 0 0 0 1px rgba(245,158,11,0.5)',
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 18px 40px -24px rgba(0,0,0,0.8)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.65', transform: 'scale(1.08)' },
        },
        flowDash: {
          to: { 'stroke-dashoffset': '-24' },
        },
        travel: {
          '0%': { left: '-6%', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { left: '106%', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ringPing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out both',
        pulseGlow: 'pulseGlow 1.6s ease-in-out infinite',
        flowDash: 'flowDash 0.8s linear infinite',
        travel: 'travel 1.1s ease-in-out forwards',
        shimmer: 'shimmer 2.5s linear infinite',
        ringPing: 'ringPing 1.2s ease-out infinite',
        floaty: 'floaty 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
