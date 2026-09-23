// src/theme/theme.ts
//
// "Soft campus" palette — warm cream/peach base instead of the previous
// cool blue-grey, pastel-tinted badges per category instead of a single
// low-opacity blue-grey tint everywhere. Chosen specifically over the
// previous claymorphism look because it drops shadows/elevation
// entirely (see clayShadow/clayShadowSoft below) — a flat, bordered
// depth style rather than a raised one, which permanently sidesteps
// Android's elevation-always-renders-black behavior instead of just
// tuning it down.
export const colors = {
  primary: '#0B3D91',
  primaryDark: '#082A66',
  accent: '#C1621F',
  background: '#FDF6F0',       // warm cream, not cool lavender
  surface: '#FFFFFF',
  textPrimary: '#3D3229',      // warm dark brown, not blue-black
  textSecondary: '#A6957F',    // warm taupe, not cool grey
  border: '#EDE4D6',
  success: '#2E6B45',
  danger: '#C1442E',           // stays a real alarming red, not pink — 73 usages across the app rely on this reading as "error", separate from the badge.pink category tint below
  warning: '#9A4A0F',

  // gradient stops for background + hero areas — same warm family, just
  // two adjacent stops rather than one flat fill.
  gradientStart: '#FDF6F0',
  gradientEnd: '#FBEEE3',
  glassTint: 'rgba(255,255,255,0.72)',
  glassBorder: '#EDE4D6',
  clayHighlight: '#FFFFFF',
  claySurface: '#FDF6F0',

  // Pastel category badges — each a { bg, fg } pair, fg chosen dark
  // enough on its own bg for AA contrast. Use bg for an icon's rounded
  // backdrop and fg for the icon/number itself, e.g. peach for
  // academics/timetable, pink for mess/food, green for clubs/social,
  // blue for utility/lookup actions. Pick whichever pair best fits the
  // thing being tagged — these replace the old single-tint-color-plus-
  // opacity-suffix pattern (e.g. `item.tint + '1A'`) with real color
  // grading per category instead of one hue at varying alpha.
  badge: {
    peach: { bg: '#FFE8D6', fg: '#9A4A0F' },
    pink: { bg: '#F5DCE3', fg: '#B0446A' },
    green: { bg: '#E3EFE2', fg: '#2E6B45' },
    blue: { bg: '#E0E7F5', fg: '#3C5AA6' },
    purple: { bg: '#E9E3F5', fg: '#5B3FA6' },
  },
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

// Formerly a raised claymorphism shadow (see the git history on this
// file for the old shadowColor/shadowOffset/elevation version, and the
// two rounds of tuning it needed on Android). Deliberately empty now,
// not just tuned down further — the new soft-campus direction is a
// FLAT style: white cards separated from the page purely by the
// background's own color contrast (warm cream page vs white card), no
// shadow or border needed at all. That also means it's now structurally
// impossible for Android's elevation shadow to render as an unwanted
// dark tint, in any card anywhere that spreads this in — not tuned
// down, entirely absent as a rendering path.
//
// Left as empty (rather than deleted) so every file across the app that
// still does `...clayShadow` / `...clayShadowSoft` in a style array
// keeps compiling unchanged and just renders flat now — no per-file
// edits needed for this redesign pass to take effect everywhere at
// once. ClayCard.tsx (the shared wrapper most screens use) has its own
// matching update; anything spreading these two constants directly
// picks up the flat look automatically.
export const clayShadow = {};

export const clayShadowSoft = {};
