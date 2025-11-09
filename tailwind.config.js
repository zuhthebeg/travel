/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ["light", "dark", "cupcake", "winter"], // 사용할 테마
    darkTheme: "dark", // 다크모드 테마
    base: true,
    styled: true,
    utils: true,
  },
}
