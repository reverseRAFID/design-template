import type { Config } from 'tailwindcss';

/**
 * Tailwind's default palette is replaced wholesale: every colour in the app must
 * resolve to a token in src/styles/tokens.css, which is the only file with hex values.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      mt: {
        orange: 'var(--mt-orange)',
        'orange-hot': 'var(--mt-orange-hot)',
        'orange-deep': 'var(--mt-orange-deep)',
        cream: 'var(--mt-cream)',
        ink: 'var(--mt-ink)',
        bg: 'var(--mt-bg)',
        surface: 'var(--mt-surface)',
        'surface-2': 'var(--mt-surface-2)',
        line: 'var(--mt-line)',
        'line-strong': 'var(--mt-line-strong)',
        text: 'var(--mt-text)',
        'text-dim': 'var(--mt-text-dim)',
        'text-mute': 'var(--mt-text-mute)',
        ok: 'var(--mt-ok)',
        warn: 'var(--mt-warn)',
      },
    },
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        pill: 'var(--r-pill)',
        lg: 'var(--r-lg)',
        md: 'var(--r-md)',
        sm: 'var(--r-sm)',
      },
      boxShadow: { glow: 'var(--mt-glow)' },
      backgroundImage: { chrome: 'var(--mt-chrome)', grid: 'var(--mt-grid)' },
      transitionDuration: { state: '160ms', preset: '400ms' },
    },
  },
  plugins: [],
} satisfies Config;
