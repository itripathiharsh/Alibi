import tokens from "@alibi/design-tokens";

const light = tokens.colors.light;

export const theme = {
  colors: {
    ...light,
    background: {
      base: "#FBF9F8",
      default: "#FBF9F8",
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
      default: "#E7EAF0",
    },
    accent: {
      amber: "#FF741F",
      primary: "#FF741F",
      orange: "#FF741F",
      navy: "#0B2030",
      emerald: "#10B981",
      blue: "#0EA5E9",
      purple: "#8B5CF6",
    },
    brand: {
      orange: "#FF741F",
      navy: "#0B2030",
      peach: "#FFF1E6",
      peachLight: "#FFF8F2",
      peachBorder: "#FED7AA",
      peachText: "#9A3412",
      peachDarkText: "#7C2D12",
    },
    category: {
      work: "#FF741F",
      academic: "#2563EB",
      personal: "#10B981",
      general: "#64748B",
    },
  },
  spacing: tokens.spacing,
  radius: {
    control: 8,
    card: 20,
    cardPrimary: 20,
    cardSecondary: 14,
    sheet: 24,
    full: 9999,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 24,
    tokens: tokens.radius,
  },
  shadows: {
    sm: {
      shadowColor: "#0B2030",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    card: {
      shadowColor: "#0B2030",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
    elevated: {
      shadowColor: "#0B2030",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
  },
  typography: tokens.typography,
};

export default theme;
