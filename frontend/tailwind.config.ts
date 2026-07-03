import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f7fac0",
          100: "#eef580",
          500: "#D2E600",
          600: "#b8c900",
          700: "#9aab00",
        },
        gold: {
          soft: "#F6E7CE",
          DEFAULT: "#C97F1E",
          deep: "#8F5A12",
        },
      },
      fontFamily: {
        sans:    ["Instrument Sans", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
