const lightColors = {
  background: '#f6f8f8',
  backgroundAlt: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#fdfbf7', // cream warm
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
  // Primary Colors
  primary: '#196ee6',
  primaryContent: '#0e3a3a',
  primaryDark: '#0e7490',
  
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
  
  // Accent Colors
  lilac: '#e0c3fc',
  lilacSoft: '#f3e5f5',
  peach: '#ffd1b3',
  peachSoft: '#ffe8e0',
  creamSoft: '#fff8f0',
  creamWarm: '#fdfbf7',
  mintSoft: '#e0f2f1',
  
  // Semantic Colors
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Gradients (for LinearGradient)
  gradients: {
    mesh: isDark ? ['#4c1d95', '#9a3412', '#0e7490'] : ['#e0c3fc', '#ffd1b3', '#196ee6', '#f6f8f8'],
    meshDark: ['#4c1d95', '#9a3412', '#0e7490'],
    campus: isDark ? ['#1a1a1a', '#102222'] : ['#fff8f0', '#fff5eb', '#ffe8e0'],
    campusDark: ['#1a1a1a', '#102222'],
    softMesh: ['#e0c3fc', '#ffd1b3', '#196ee6'],
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
  xl: 24,
  xxl: 28,
  full: 9999,
};

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
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
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
};
