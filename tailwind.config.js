/** @type {import('tailwindcss').Config} */
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

// Paleta da marca (MARCA.md). As cores padrão do Tailwind usadas no sistema
// (verde, amarelo, vermelho, cinza, azul...) são remapeadas para os tons da marca,
// assim nenhuma tela fica fora da paleta.
const sucesso = { 50: '#EEF4EF', 100: '#DAE8DD', 200: '#B6D2BD', 300: '#8AB596', 400: '#5E9469', 500: '#4A8659', 600: '#3F7A4E', 700: '#3F7A4E', 800: '#33633F', 900: '#284E32', 950: '#1B3522' };
const alerta = { 50: '#FBF4E6', 100: '#F6E7C6', 200: '#EDD293', 300: '#E2B65A', 400: '#D59E30', 500: '#C98A1B', 600: '#B07816', 700: '#8F6112', 800: '#734E0F', 900: '#5C3E0C', 950: '#3A2707' };
const erro = { 50: '#F8ECEC', 100: '#F1D5D5', 200: '#E3AEAE', 300: '#CF7F7F', 400: '#B85454', 500: '#A83A3A', 600: '#9B2C2C', 700: '#9B2C2C', 800: '#7E2424', 900: '#621C1C', 950: '#3F1212' };
const tinta = { 50: '#FBF8F3', 100: '#F5EFE6', 200: '#E4DACB', 300: '#CFC2B2', 400: '#A89A8C', 500: '#857668', 600: '#6B5D53', 700: '#54473F', 800: '#3D322B', 900: '#2B211C', 950: '#1E1713' };
const terracota = { 50: '#F9F0EA', 100: '#F3E1D7', 200: '#EBC3AE', 300: '#E08A63', 400: '#CB6B43', 500: '#B5502E', 600: '#A34628', 700: '#8E3C20', 800: '#74311A', 900: '#5A2614', 950: '#2B211C' };

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
        accent: { 50: terracota[50], 100: terracota[100], 700: terracota[700] },
        terracota,
        tinta,
        papel: '#F5EFE6',
        superficie: '#FBF8F3',
        borda: '#E4DACB',
        sucesso: sucesso[600],
        alerta: alerta[500],
        erro: erro[600],
        // Remapeamento das cores padrão para a paleta
        emerald: sucesso, green: sucesso, teal: sucesso, lime: sucesso,
        amber: alerta, yellow: alerta,
        rose: erro, red: erro, pink: erro,
        orange: terracota,
        stone: tinta, gray: tinta, slate: tinta, zinc: tinta, neutral: tinta,
        sky: tinta, blue: tinta, cyan: tinta, indigo: tinta, violet: tinta, purple: tinta, fuchsia: tinta,
      },
      fontFamily: {
        sans: ['Jost', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Cascadia Code', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
      },
      borderRadius: { DEFAULT: '3px', md: '4px', lg: '4px', xl: '5px', '2xl': '6px', '3xl': '6px' },
      boxShadow: {
        card: '0 1px 2px rgb(43 33 28 / 0.05)',
        floating: '0 6px 20px -6px rgb(43 33 28 / 0.18)',
      },
      screens: { xs: '400px' },
    },
  },
  plugins: [],
};
