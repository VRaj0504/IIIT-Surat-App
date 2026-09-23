import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ClayCard from './ClayCard';
import { colors, spacing, radius, typography } from '../theme/theme';
import { getClubIcon } from '../data/clubIcons';

type ClubIconTileProps = {
  name: string;
  onPress: () => void;
};

// One tile in the "All Clubs" grid — icon in a tinted circle, club name
// below. Icon/color come from the clubIcons.ts map (falls back to a
// deterministic letter-tile color if the club isn't in the map yet).
export default function ClubIconTile({ name, onPress }: ClubIconTileProps) {
  const { icon, color } = getClubIcon(name);

  return (
    <ClayCard flat style={styles.card} onPress={onPress}>
      <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </ClayCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '31%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    // columnWrapperStyle's `gap` (ClubsScreen.tsx) only spaces items
    // WITHIN one row horizontally — FlatList renders each row of 3 as a
    // separate sibling View, so there was no vertical gap between rows
    // at all, and cards from adjacent rows were touching directly. This
    // margin is what actually separates row from row.
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: 'center',
    // Reserves space for a full 2 lines regardless of whether this
    // particular name actually wraps — without it, a 1-line name like
    // "SARAS" made a visibly shorter card than a 2-line name like
    // "ASTRA (Astronomy an...)" in the very same row, which is the
    // jagged/uneven look. lineHeight × 2 rather than a guessed px value,
    // so it still tracks if the caption size ever changes.
    lineHeight: typography.caption.fontSize * 1.3,
    minHeight: typography.caption.fontSize * 1.3 * 2,
  },
});
