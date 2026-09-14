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
        ember: {
          50: '#fff1f1',
          100: '#ffdfdf',
          200: '#ffc5c5',
          300: '#ff9d9d',
          400: '#ff6464',
          500: '#f83434',
          600: '#e51919',
          700: '#c11010',
          800: '#9f1111',
          900: '#831414',
          950: '#480505',
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
