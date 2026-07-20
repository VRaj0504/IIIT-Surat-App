import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import appJson from '../../app.json';

const APP_VERSION = appJson.expo?.version ?? '1.0.0';

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="school-outline" size={32} color={colors.primary} />
        </View>

        <Text style={styles.title}>IIIT Surat App</Text>
        <Text style={styles.version}>Version {APP_VERSION}</Text>

        <Text style={styles.paragraph}>
          Built to bring everyday campus life — attendance, notices, clubs, resources, and more —
          into one place, so getting through the day at IIIT Surat takes less digging around and
          fewer scattered links.
        </Text>

        <View style={styles.creditCard}>
          <Text style={styles.creditLabel}>Made by</Text>
          <Text style={styles.creditName}>Vaibhav Raj</Text>
          <Text style={styles.creditMeta}>2nd Year, CSE · UG25CSE114</Text>
        </View>

        <Text style={styles.footer}>For the students and faculty of IIIT Surat.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, alignItems: 'center', paddingTop: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h1, color: colors.textPrimary, textAlign: 'center' },
  version: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  paragraph: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  creditCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  creditLabel: { ...typography.caption, color: colors.textSecondary },
  creditName: { ...typography.h2, color: colors.primary, fontWeight: '700', marginTop: 2 },
  creditMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  footer: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xl, textAlign: 'center' },
});
