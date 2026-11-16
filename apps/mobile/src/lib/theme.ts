import tokens from "@alibi/design-tokens";

const light = tokens.colors.light;

export const theme = {
  colors: {
    ...light,
    background: {
      base: "#F8FAFC",
    },
    surface: {
      card: "#FFFFFF",
      surface2: "#F1F5F9",
      elevated: "#FFFFFF",
    },
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      muted: "#94A3B8",
    },
    border: {
      subtle: "#E2E8F0",
    },
    accent: {
      amber: "#F97316",
      emerald: "#10B981",
      primary: "#F97316",
      blue: "#0EA5E9",
      purple: "#8B5CF6",
    },
    category: {
      work: "#F97316",
      academic: "#2563EB",
      personal: "#10B981",
      general: "#64748B",
    },
  },
  spacing: tokens.spacing,
  radius: tokens.radius,
  typography: tokens.typography,
};

export default theme;
