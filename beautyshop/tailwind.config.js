/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        rose: {
          950: '#1a0a0e',
          900: '#3d1020',
          800: '#6b1e38',
          700: '#8b2550',
          600: '#b03070',
          500: '#c8456a',
          400: '#e06585',
          300: '#f09ab0',
          200: '#f7c5d0',
          100: '#fce8ed',
          50: '#fff5f7',
        },
        gold: {
          900: '#3d2e00',
          800: '#6b5000',
          700: '#997300',
          600: '#c49a00',
          500: '#e6b800',
          400: '#f0c830',
          300: '#f5d96a',
          200: '#faeaa0',
          100: '#fdf5d0',
        },
        charcoal: {
          950: '#0d0d0f',
          900: '#1a1a1f',
          800: '#252530',
          700: '#303040',
          600: '#404055',
          500: '#55556a',
        }
      }
    }
  },
  plugins: []
}
