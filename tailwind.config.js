/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'plus-jakarta': ['Plus Jakarta Sans', 'sans-serif'],
        'sora': ['Sora', 'sans-serif'],
        'opensans': ['Open Sans', 'sans-serif'],
        'jetbrains': ['JetBrains Mono', 'monospace'],
        'bricolage': ['Bricolage Grotesque', 'sans-serif'],
        'montserrat': ['Montserrat', 'sans-serif'],
        'poppins': ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}