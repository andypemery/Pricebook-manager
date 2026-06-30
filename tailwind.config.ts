import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./config/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        axiomNavy: "#120462",
        axiomBlue: "#00c7f3",
        axiomAqua: "#00ece3",
        axiomGrey: "#565656",
        axiomBorder: "var(--border-soft)",
        axiomMuted: "var(--text-muted)"
      }
    }
  },
  plugins: []
};

export default config;
