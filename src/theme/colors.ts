const lightColors = {
  background: '#fdfbf7', // cream-warm
  backgroundAlt: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#fdfbf7',
  text: '#111818',
  textSecondary: '#60707d',
  border: '#e2e8f0',
  card: '#ffffff',
};

const darkColors = {
  background: '#102222',
  backgroundAlt: '#111821',
  surface: '#1a222c',
  surfaceAlt: '#1a1520',
  text: '#ffffff',
  textSecondary: '#94a3b8',
  border: '#334155',
  card: '#1a222c',
};

export const getColors = (isDark: boolean) => ({
  // Primary Colors - Stitch design system
  primary: '#13ecec',
  primaryContent: '#0e3a3a',
  primaryDark: '#0fdbdb',

  // Theme-specific colors
  background: isDark ? darkColors.background : lightColors.background,
  backgroundAlt: isDark ? darkColors.backgroundAlt : lightColors.backgroundAlt,
  surface: isDark ? darkColors.surface : lightColors.surface,
  surfaceAlt: isDark ? darkColors.surfaceAlt : lightColors.surfaceAlt,
  text: isDark ? darkColors.text : lightColors.text,
  textSecondary: isDark ? darkColors.textSecondary : lightColors.textSecondary,
  border: isDark ? darkColors.border : lightColors.border,
  card: isDark ? darkColors.card : lightColors.card,

  // Keep light/dark objects for reference
  light: lightColors,
  dark: darkColors,

  // Stitch Palette
  creamWarm: '#fdfbf7',
  mintSoft: '#e0f2f1',
  mintMist: '#e0f7fa',
  lilacSoft: '#f3e5f5',
  paleAqua: '#e0f7fa',
  softPeach: '#ffe8d6',
  softMint: '#e0f2f1',
  softLilac: '#f3e5f5',
  softCream: '#fff9c4',
  tealSoft: '#d6f2f2',
  tealSender: '#e0f2f1',
  primarySoft: '#e0fbfb',
  aquaSoft: '#E0F7FA',

  // Semantic Colors
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',

  // Gradients (for LinearGradient)
  gradients: {
    mesh: isDark
      ? ['#102222', '#1a2a2a', '#102222']
      : ['#e0f7fa', '#fdfbf7', '#f3e5f5'],
    meshLight: ['#e0f7fa', '#fdfbf7', '#f3e5f5', '#fff8f0'],
    peach: ['#fff5e6', '#ffe0cc'],
    mint: ['#e6fffa', '#d1f7f0'],
    lilac: ['#f8f0fc', '#ecdcf7'],
    aqua: ['#e6ffff', '#ccfbfb'],
    cream: ['#fffdf5', '#fff8e1'],
    glass: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)',
  },
});

// Export static version for backward compatibility
export const Colors = getColors(false);

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  full: 9999,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
};
