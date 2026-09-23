import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
};

// A shared title block for the top of a screen's body content (NOT the
// native nav bar, which is hidden on these screens — this is the custom
// "Timetable" / "Clubs & Events" text each screen was rendering itself).
// Before this, every screen wrote its own version: TimetableScreen had
// title+subtitle stacked with no room for an action button, ClubsScreen
// had title+button in a row with no subtitle, HomeScreen's greeting was
// yet a third layout again — each visually inconsistent with the others
// even though they're all doing the same job. One component now, used
// wherever a screen needs a title (optionally with a subtitle below it,
// or a single icon action button on the right, e.g. Clubs' "add club").
export default function ScreenHeader({ title, subtitle, actionIcon, onAction }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionIcon && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction}>
          <Ionicons name={actionIcon} size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  textCol: { flex: 1 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
