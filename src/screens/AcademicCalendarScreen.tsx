import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme/theme';
import { academicCalendars } from '../data/academicCalendar';

export default function AcademicCalendarScreen() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const calendar = academicCalendars[selectedIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Academic Calendar</Text>
      <Text style={styles.subtitle}>2026-27</Text>

      <View style={styles.tabs}>
        {academicCalendars.map((cal, index) => (
          <TouchableOpacity
            key={cal.title}
            style={[styles.tab, selectedIndex === index && styles.tabActive]}
            onPress={() => setSelectedIndex(index)}
          >
            <Text style={[styles.tabText, selectedIndex === index && styles.tabTextActive]}>
              {cal.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {calendar.events.map((event, index) => (
          <View key={index} style={styles.eventCard}>
            <Text style={styles.activity}>{event.activity}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.duration}>{event.duration}</Text>
              {event.week !== '-' && <Text style={styles.week}>Week {event.week}</Text>}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: '#fff' },
  list: { paddingBottom: spacing.xl },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activity: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  duration: { ...typography.caption, color: colors.textSecondary },
  week: { ...typography.caption, color: colors.primary, fontWeight: '700' },
});