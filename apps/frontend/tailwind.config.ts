import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        fg: "var(--fg)",
        accent: "var(--accent)",
        border: "var(--border)"
      },
      boxShadow: {
        lift: "0 20px 60px -20px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;
