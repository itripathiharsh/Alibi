import tokens from "../tokens.json";

export type DesignTokens = typeof tokens;
export type ColorTheme = typeof tokens.colors.light;
export type Spacing = typeof tokens.spacing;
export type Radius = typeof tokens.radius;
export type Typography = typeof tokens.typography;

export { tokens };
export default tokens;
