import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
};

// Used for modules we haven't built out yet (Mess Menu, Lost & Found, Resources,
// Faculty Directory, Placements). Each becomes its own real screen in a later step.
export default function PlaceholderScreen({ title, icon, description }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Coming up next</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  badge: { backgroundColor: colors.accent, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
