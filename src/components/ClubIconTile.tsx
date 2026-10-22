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

    lineHeight: typography.caption.fontSize * 1.3,
    minHeight: typography.caption.fontSize * 1.3 * 2,
  },
});
