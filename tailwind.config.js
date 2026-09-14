/** @type {import('tailwindcss').Config} */
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: color('canvas'),
        surface: {
          DEFAULT: color('surface'),
          soft: color('surface-soft'),
          muted: color('surface-muted'),
        },
        ink: {
          DEFAULT: color('ink'),
          secondary: color('ink-secondary'),
          muted: color('ink-muted'),
        },
        line: {
          DEFAULT: color('line'),
          strong: color('line-strong'),
        },
        brand: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [shade, color(`brand-${shade}`)]),
        ),
        accent: { 50: '#fff3ed', 100: '#ffe2d3', 700: '#a94325' },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Arial', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
      },
      boxShadow: {
        card: '0 2px 8px -3px rgb(24 49 60 / 0.08), 0 12px 28px -20px rgb(24 49 60 / 0.12)',
        floating: '0 8px 32px -8px rgb(24 49 60 / 0.22)',
      },
      screens: { xs: '400px' },
    },
  },
  plugins: [],
};
