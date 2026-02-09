import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows, getColors } from './colors';

export const theme = {
  colors: Colors,
  spacing: Spacing,
  borderRadius: BorderRadius,
  fontSize: FontSizes,
  fontWeight: FontWeights,
  shadows: Shadows,
};

export type Theme = typeof theme;
export { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows, getColors };
