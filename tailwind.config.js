/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAF8",
        fg: "#0A0A0A",
        muted: "#6B6B6B",
        subtle: "#999999",
        border: "#E0E0E0",
        warm: "#F6F4F0",
        card: "#FFFFFF",
        orange: { DEFAULT: "#FF4F00", light: "#FFA27A" },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { card: "16px", pill: "9999px" },
      boxShadow: {
        sm: "0 1px 4px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04)",
        md: "0 2px 8px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
        accent: "0 4px 20px rgba(255,79,0,0.30)",
      },
      backgroundImage: {
        grad: "linear-gradient(to top, #FF4F00, #FFA27A)",
      },
    },
  },
  plugins: [],
};
