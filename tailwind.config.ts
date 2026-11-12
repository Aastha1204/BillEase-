import type { Config } from 'tailwindcss';
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)', saffron: 'rgb(var(--gold2) / <alpha-value>)', paid: '#22C55E', overdue: '#F43F5E', igst: '#6366F1', info: '#38BDF8', amber: '#F59E0B',
      },
      fontFamily: { sans: ['var(--font-ui)', 'system-ui', 'sans-serif'], mono: ['var(--font-mono)', 'ui-monospace', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
