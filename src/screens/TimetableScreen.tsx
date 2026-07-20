import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme/theme';
import { timetable } from '../data/sampleData';

export default function TimetableScreen() {
  const [selectedDay, setSelectedDay] = useState(timetable[0].day);
  const daySchedule = timetable.find((d) => d.day === selectedDay);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Timetable</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs} contentContainerStyle={{ gap: spacing.sm }}>
        {timetable.map((d) => (
          <TouchableOpacity
            key={d.day}
            onPress={() => setSelectedDay(d.day)}
            style={[styles.dayTab, selectedDay === d.day && styles.dayTabActive]}
          >
            <Text style={[styles.dayTabText, selectedDay === d.day && styles.dayTabTextActive]}>{d.day}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={daySchedule?.slots ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No classes scheduled.</Text>}
        renderItem={({ item }) => (
          <View style={styles.classCard}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeText}>{item.startTime}</Text>
              <Text style={styles.timeText}>{item.endTime}</Text>
            </View>
            <View style={styles.classInfo}>
              <Text style={styles.subject}>{item.subject}</Text>
              <Text style={styles.meta}>{item.faculty} · {item.room}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.md },
  dayTabs: { marginBottom: spacing.md, flexGrow: 0 },
  dayTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayTabText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  dayTabTextActive: { color: '#fff' },
  list: { paddingBottom: spacing.xl },
  classCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeBlock: { width: 60, marginRight: spacing.md, justifyContent: 'center' },
  timeText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  classInfo: { flex: 1, justifyContent: 'center' },
  subject: { ...typography.h3, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
});
