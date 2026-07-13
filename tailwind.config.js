/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#111113",
        panel2: "#17171a",
        border: "#242428",
        accent: "#5e6ad2",
        "accent-soft": "rgba(94,106,210,0.14)",
        muted: "#8b8b93",
      },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
