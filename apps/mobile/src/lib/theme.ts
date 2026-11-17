import tokens from "@alibi/design-tokens";

const light = tokens.colors.light;

export const theme = {
  colors: {
    ...light,
    background: {
      base: "#FBF9F8",
    },
    surface: {
      card: "#FFFFFF",
      surface2: "#F4F5F7",
      elevated: "#FFFFFF",
    },
    text: {
      primary: "#0B2030",
      secondary: "#53657A",
      muted: "#8A96A4",
    },
    border: {
      subtle: "#E7EAF0",
    },
    accent: {
      amber: "#FF741F",
      emerald: "#10B981",
      primary: "#FF741F",
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
