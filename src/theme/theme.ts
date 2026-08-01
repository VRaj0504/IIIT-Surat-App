// src/theme/theme.ts
export const colors = {
  primary: '#0B3D91',
  primaryDark: '#082A66',
  accent: '#F5A623',
  background: '#EEF1F8',       // soft cool grey-lavender, not flat white
  surface: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#22A559',
  danger: '#E5484D',
  warning: '#F5A623',

  // new: gradient stops for background + hero areas
  gradientStart: '#E9EEFB',
  gradientEnd: '#DCE6FA',
  glassTint: 'rgba(255,255,255,0.55)',
  glassBorder: 'rgba(255,255,255,0.65)',
  clayHighlight: '#FFFFFF',
  claySurface: '#EEF1F8',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, full: 999 };

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

// Claymorphism = a raised, soft-plastic feel: a light shadow from the
// top-left (highlight) and a darker shadow from the bottom-right (depth),
// on a surface close in tone to the background so it looks molded, not cut out.
export const clayShadow = {
  // use as the OUTER wrapper style
  shadowColor: '#A9B4D0',
  shadowOffset: { width: 6, height: 6 },
  shadowOpacity: 0.35,
  shadowRadius: 12,
  elevation: 8,
};

export const clayShadowSoft = {
  shadowColor: '#A9B4D0',
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 0.25,
  shadowRadius: 6,
  elevation: 4,
};