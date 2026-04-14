import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-dim": "var(--surface-dim)",
        "surface-container-lowest": "var(--surface-container-lowest)",
        "surface-container-low": "var(--surface-container-low)",
        "surface-container": "var(--surface-container)",
        "surface-container-high": "var(--surface-container-high)",
        "surface-container-highest": "var(--surface-container-highest)",
        "surface-bright": "var(--surface-bright)",
        "surface-variant": "var(--surface-variant)",
        "surface-tint": "var(--surface-tint)",
        primary: "var(--primary)",
        "primary-container": "var(--primary-container)",
        "primary-dim": "var(--primary-dim)",
        "primary-fixed": "var(--primary-fixed)",
        "primary-fixed-dim": "var(--primary-fixed-dim)",
        secondary: "var(--secondary)",
        "secondary-dim": "var(--secondary-dim)",
        "secondary-container": "var(--secondary-container)",
        "secondary-fixed": "var(--secondary-fixed)",
        "secondary-fixed-dim": "var(--secondary-fixed-dim)",
        tertiary: "var(--tertiary)",
        "tertiary-dim": "var(--tertiary-dim)",
        "tertiary-container": "var(--tertiary-container)",
        "tertiary-fixed": "var(--tertiary-fixed)",
        "tertiary-fixed-dim": "var(--tertiary-fixed-dim)",
        error: "var(--error)",
        "error-container": "var(--error-container)",
        "error-dim": "var(--error-dim)",
        outline: "var(--outline)",
        "outline-variant": "var(--outline-variant)",
        "on-surface": "var(--on-surface)",
        "on-surface-variant": "var(--on-surface-variant)",
        "on-background": "var(--on-background)",
        "on-primary": "var(--on-primary)",
        "on-primary-container": "var(--on-primary-container)",
        "on-primary-fixed": "var(--on-primary-fixed)",
        "on-primary-fixed-variant": "var(--on-primary-fixed-variant)",
        "on-secondary": "var(--on-secondary)",
        "on-secondary-container": "var(--on-secondary-container)",
        "on-secondary-fixed": "var(--on-secondary-fixed)",
        "on-secondary-fixed-variant": "var(--on-secondary-fixed-variant)",
        "on-tertiary": "var(--on-tertiary)",
        "on-tertiary-container": "var(--on-tertiary-container)",
        "on-tertiary-fixed": "var(--on-tertiary-fixed)",
        "on-tertiary-fixed-variant": "var(--on-tertiary-fixed-variant)",
        "on-error": "var(--on-error)",
        "on-error-container": "var(--on-error-container)",
        "inverse-surface": "var(--inverse-surface)",
        "inverse-on-surface": "var(--inverse-on-surface)",
        "inverse-primary": "var(--inverse-primary)",
        bg: "var(--bg)",
        card: "var(--card)",
        fg: "var(--fg)",
        accent: "var(--accent)",
        border: "var(--border)"
      },
      fontFamily: {
        headline: ["var(--font-main)", "Saira Stencil One", "sans-serif"],
        body: ["var(--font-main)", "Saira Stencil One", "sans-serif"],
        label: ["var(--font-subtitle)", "Red Hat Display", "sans-serif"],
        typewriter: ["var(--font-typewriter)", "Doto", "monospace"],
        mono: ["JetBrains Mono", "monospace"]
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem"
      },
      boxShadow: {
        lift: "0 0 24px rgba(6, 182, 212, 0.08)",
        glow: "0 0 15px rgba(64, 206, 237, 0.4)",
        terminal: "0 0 20px rgba(6, 182, 212, 0.15)"
      }
    }
  },
  plugins: []
};

export default config;
