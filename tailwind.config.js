/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup/**/*.{html,js,jsx}", // Scan popup folder for Tailwind classes
    "./*.html", // If you have any root HTML files using Tailwind
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite', // Define slow pulse for glowing border
      }
    },
  },
  plugins: [],
}
