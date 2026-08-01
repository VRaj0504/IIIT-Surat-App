import { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

export type ClubIconEntry = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  image?: ImageSourcePropType; // drop a real logo in assets/clubs/ and wire it here later
};

// Matched by a normalized (lowercase, no-punctuation) version of club.name.
// Add entries as new clubs are created — anything unmatched falls back to
// a generated letter tile (see getClubIcon below).
const CLUB_ICON_MAP: Record<string, ClubIconEntry> = {
  saras: { icon: 'sparkles', color: '#EC4899' },
  'abstract art and design club': { icon: 'color-palette', color: '#F97316' },
  'antra poetry club': { icon: 'create', color: '#8B5CF6' },
  'swarang singing club': { icon: 'musical-notes', color: '#22A559' },
  'malhar drama club': { icon: 'film', color: '#E5484D' },
  'groove dance club': { icon: 'body', color: '#0EA5E9' },
  'cineworks videography club': { icon: 'videocam', color: '#6366F1' },
  'exposure photography club': { icon: 'camera', color: '#14B8A6' },
  'management cultural club core team': { icon: 'people-circle', color: '#F5A623' },

  'google developers group gdg iiit surat': { icon: 'logo-google', color: '#4285F4' },
  'modern automation and robotics club marc': { icon: 'hardware-chip', color: '#0B3D91' },
  'learn code solve lcs': { icon: 'code-slash', color: '#0EA5E9' },

  'ruminate e cell of iiit surat': { icon: 'rocket', color: '#F97316' },

  'ramanujan mathematics club rmc': { icon: 'calculator', color: '#8B5CF6' },
  'astra astronomy and astrophysics club': { icon: 'planet', color: '#6366F1' },

  'indominous club': { icon: 'football', color: '#22A559' },
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getClubIcon(clubName: string): ClubIconEntry {
  const match = CLUB_ICON_MAP[normalize(clubName)];
  if (match) return match;

  console.warn(`[clubIcons] No icon mapped for "${clubName}" (normalized: "${normalize(clubName)}") — using fallback.`);

  const palette = ['#0B3D91', '#E5484D', '#22A559', '#F5A623', '#8B5CF6', '#0EA5E9', '#EC4899', '#F97316'];
  const hash = clubName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { icon: 'people', color: palette[hash % palette.length] };
}