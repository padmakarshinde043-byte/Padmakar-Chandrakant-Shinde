/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#09243f',
          deep: '#072038',
          light: '#17366d',
          soft: '#193568',
        },
        orange: {
          DEFAULT: '#df6b16',
          brand: '#ff6b00',
          vivid: '#ff9f1c',
          light: '#fff0df',
        },
        gold: {
          DEFAULT: '#efb24b',
          light: '#f8d39b',
        },
        paper: {
          DEFAULT: '#fbf8f2',
          alt: '#f0e9de',
          card: '#f7f9fc',
        },
        ink: '#102a43',
        line: '#e7ded1',
      },
      fontFamily: {
        devanagari: ['"Noto Sans Devanagari"', 'sans-serif'],
        serifDevanagari: ['"Noto Serif Devanagari"', 'serif'],
      }
    },
  },
  plugins: [],
}
