

import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  dangerText: string;
  dangerBorder: string;
  warningBg: string;
  warningText: string;
  borderStrong: string;
  page: string;
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
  dangerText: '#A3301C',
  dangerBorder: '#F5C2B8',
  warningBg: '#FFF4DB',
  warningText: '#5C3D00',
  borderStrong: '#C8D2E3',
  page: '#FFFFFF',
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

const dark: Palette = {
  primary: '#4D7CE6',
  primaryDark: '#3A64C4',
  onPrimary: '#FFFFFF',
  accent: '#E8702A',
  background: '#0B1220',
  surface: '#141C2E',
  surfaceAlt: '#1B2540',
  textPrimary: '#E8EDF7',
  textSecondary: '#A3AEC4',
  border: '#26324D',
  success: '#1F9D55',
  danger: '#E5484D',
  warning: '#E0A320',
  successBg: '#11301F',
  successFg: '#86EFAC',
  successBorder: '#1F5C38',
  dangerBg: '#3A1719',
  dangerText: '#FCA5A5',
  dangerBorder: '#5B2526',
  warningBg: '#33270C',
  warningText: '#FDE68A',
  borderStrong: '#34446A',
  page: '#0B1220',
  overlay: 'rgba(0,0,0,0.6)',
  ink: '#1C2A4A',
  onInk: '#FFFFFF',
  inkMuted: '#A9B6D3',
  heroBg: '#17357A',
  heroText: '#FFFFFF',
  heroMuted: '#B9C9EE',
  heroChip: 'rgba(255,255,255,0.14)',
  gradientStart: '#0B1220',
  gradientEnd: '#0E1628',
  glassTint: 'rgba(20,28,46,0.85)',
  glassBorder: '#26324D',
  clayHighlight: '#141C2E',
  claySurface: '#0B1220',
  badge: {
    peach: { bg: '#3A2414', fg: '#FDBA8C' },
    pink: { bg: '#3A1A2A', fg: '#F9A8C9' },
    green: { bg: '#12301F', fg: '#86EFAC' },
    blue: { bg: '#1A2A4D', fg: '#A8C1FF' },
    purple: { bg: '#2A2150', fg: '#C4B5FD' },
  },
  tile: {
    blue: { bg: '#1A2A4D', fg: '#A8C1FF' },
    mint: { bg: '#12301F', fg: '#86EFAC' },
    peach: { bg: '#3A2414', fg: '#FDBA8C' },
    lilac: { bg: '#2A2150', fg: '#C4B5FD' },
    yellow: { bg: '#33270C', fg: '#FCD34D' },
    pink: { bg: '#3A1A2A', fg: '#F9A8C9' },
  },
};

export type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'cg-theme';

export let isDark = false;
export let themePreference: ThemePreference = 'system';
export const colors: Palette = JSON.parse(JSON.stringify(light));

function applyTheme(pref: ThemePreference) {
  themePreference = pref;
  isDark = pref === 'dark' || (pref === 'system' && Appearance.getColorScheme() === 'dark');
  Object.assign(colors, JSON.parse(JSON.stringify(isDark ? dark : light)));
}

applyTheme('system');

const isPref = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';

export async function loadThemePreference() {
  try {
    const v = Platform.OS === 'web' ? globalThis.localStorage?.getItem(THEME_KEY) : await AsyncStorage.getItem(THEME_KEY);
    if (isPref(v)) applyTheme(v);
  } catch {}
}

export async function saveThemePreference(pref: ThemePreference) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(THEME_KEY, pref);
    else await AsyncStorage.setItem(THEME_KEY, pref);
  } catch {}
}

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
