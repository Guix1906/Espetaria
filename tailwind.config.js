/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#06070a',
          900: '#090a0f',
          850: '#0e1017',
          800: '#12141d',
        },
        carbon: {
          950: '#0f1016',
          900: '#14151f',
          850: '#181a26',
          800: '#1e202f',
          700: '#282b3d',
          600: '#35394f',
        },
        ember: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        charcoal: {
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        }
      },
      screens: {
        'xs': '400px',
      }
    },
  },
  plugins: [],
}
