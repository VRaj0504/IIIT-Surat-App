

type Badge = { bg: string; fg: string };

export type Palette = {
  primary: string;
  primaryDark: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  successBg: string;
  successFg: string;
  successBorder: string;
  dangerBg: string;
  overlay: string;
  ink: string;
  onInk: string;
  inkMuted: string;
  heroBg: string;
  heroText: string;
  heroMuted: string;
  heroChip: string;
  gradientStart: string;
  gradientEnd: string;
  glassTint: string;
  glassBorder: string;
  clayHighlight: string;
  claySurface: string;
  badge: { peach: Badge; pink: Badge; green: Badge; blue: Badge; purple: Badge };

  tile: { blue: Badge; mint: Badge; peach: Badge; lilac: Badge; yellow: Badge; pink: Badge };
};

const light: Palette = {
  primary: '#0B3D91',
  primaryDark: '#082A66',
  onPrimary: '#FFFFFF',
  accent: '#D9661F',
  background: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F6',
  textPrimary: '#0E1A33',
  textSecondary: '#5B6478',
  border: '#E1E6EF',
  success: '#15803D',
  danger: '#C1442E',
  warning: '#9A4A0F',
  successBg: '#DCFCE7',
  successFg: '#14532D',
  successBorder: '#86EFAC',
  dangerBg: '#FDECEA',
  overlay: 'rgba(14,26,51,0.5)',
  ink: '#0E1A33',
  onInk: '#FFFFFF',
  inkMuted: '#AEB8CC',
  heroBg: '#0B3D91',
  heroText: '#FFFFFF',
  heroMuted: '#C9D6F2',
  heroChip: 'rgba(255,255,255,0.14)',
  gradientStart: '#F3F5F9',
  gradientEnd: '#EEF2F8',
  glassTint: 'rgba(255,255,255,0.8)',
  glassBorder: '#E1E6EF',
  clayHighlight: '#FFFFFF',
  claySurface: '#F3F5F9',
  badge: {
    peach: { bg: '#FDEBDD', fg: '#A04E12' },
    pink: { bg: '#F9E1E8', fg: '#A63D63' },
    green: { bg: '#E1F3E6', fg: '#1F6B3A' },
    blue: { bg: '#E3EAF8', fg: '#2F4F9E' },
    purple: { bg: '#ECE6F8', fg: '#5B3FA6' },
  },
  tile: {
    blue: { bg: '#DCE7FF', fg: '#1D3FA8' },
    mint: { bg: '#D5F2E3', fg: '#11643F' },
    peach: { bg: '#FFE1CC', fg: '#9A3412' },
    lilac: { bg: '#E7DEFF', fg: '#5B21B6' },
    yellow: { bg: '#FFF1B8', fg: '#854D0E' },
    pink: { bg: '#FADCE6', fg: '#9D174D' },
  },
};

export const isDark = false;

export const colors: Palette = light;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, full: 999 };

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
};

export const clayShadow = {};

export const clayShadowSoft = {};
