// Central theme file — change colors/fonts here and it propagates everywhere.
// IIIT Surat's brand color is a deep blue; we pair it with a warm amber accent.

export const colors = {
  primary: '#0B3D91',      // deep institute blue
  primaryDark: '#082A66',
  accent: '#F5A623',       // amber accent for highlights/CTAs
  background: '#F7F8FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#22A559',
  danger: '#E5484D',
  warning: '#F5A623',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};
