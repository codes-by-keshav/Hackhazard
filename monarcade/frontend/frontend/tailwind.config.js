/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        arcade: ["'Press Start 2P'", "cursive"],
        game: ['Rubik Bubbles', 'cursive'],
        display: ['Righteous', 'cursive'],
        exo: ['Exo 2', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
