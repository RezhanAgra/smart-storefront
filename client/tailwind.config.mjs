/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,ts}"],
  theme: {
    extend: {
      fontFamily: {
        // Inter untuk body dan angka (tabular figures rapi), Plus Jakarta Sans untuk heading.
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans Variable"', '"Inter Variable"', "ui-sans-serif", "sans-serif"],
        // Khusus wordmark logo: Syne, geometris lebar dengan karakter kuat di bobot 800.
        brand: ['"Syne Variable"', '"Plus Jakarta Sans Variable"', "ui-sans-serif", "sans-serif"],
      },
      colors: {
        night: { DEFAULT: "#070913", raised: "#0d1122" },
      },
    },
  },
  plugins: [],
};
