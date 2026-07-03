import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
      },
      fontFamily: {
        sans: ["Söhne", "Soehne", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
