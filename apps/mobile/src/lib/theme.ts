import tokens from "@alibi/design-tokens";

const dark = tokens.colors.dark;

export const theme = {
  colors: {
    ...dark,
    background: {
      base: dark.bg,
    },
    surface: {
      card: dark.surface,
      surface2: dark.surface2,
    },
    text: {
      primary: dark.text,
      secondary: dark.textMuted,
    },
    border: {
      subtle: dark.border,
    },
    accent: {
      amber: dark.warning,
      emerald: dark.success,
      primary: dark.primary,
    },
  },
  spacing: tokens.spacing,
  radius: tokens.radius,
  typography: tokens.typography,
};

export default theme;
