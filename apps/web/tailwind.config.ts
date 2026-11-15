import type { Config } from "tailwindcss";
import tokens from "@alibi/design-tokens/tokens.json";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        surface2: "var(--color-surface-2)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        border: "var(--color-border)",
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        "cat-professional": tokens.colors.light.category.professional,
        "cat-academic": tokens.colors.light.category.academic,
        "cat-personal": tokens.colors.light.category.personal,
        "cat-learning": tokens.colors.light.category.learning,
      },
      borderRadius: {
        control: tokens.radius.control,
        card: tokens.radius.card,
        sheet: tokens.radius.sheet,
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        scaleIn: "scaleIn 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;

