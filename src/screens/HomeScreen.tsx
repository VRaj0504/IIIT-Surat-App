import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import { useAttendance } from '../hooks/useAttendance';
import { useAuth } from '../context/AuthContext';
import { timetable } from '../data/sampleData';
import { subscribeToNotices, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const quickLinks: { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList }[] = [
  { label: 'Attendance', icon: 'checkmark-done-outline', route: 'Attendance' },
  { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu' },
  { label: 'CGPA Calculator', icon: 'calculator-outline', route: 'CGPACalculator' },
  { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar' },
  { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound' },
  { label: 'Resources', icon: 'book-outline', route: 'Resources' },
  { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty' },
  { label: 'Placements', icon: 'briefcase-outline', route: 'Placement' },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
const isFaculty = profile?.role === 'faculty';
  const { overallPercentage, loaded } = useAttendance();

  // Today's classes: count today's slots from the (currently static)
  // timetable data. weekday names match `day` exactly ('Monday', etc.)
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const classesToday = timetable.find((d) => d.day === todayName)?.slots.length ?? 0;

  // New notices: count notices posted in the last 24 hours, live from Firestore.
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToNotices(setNotices);
    return () => unsubscribe();
  }, []);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newNoticesCount = notices.filter(
    (n) => n.createdAt && n.createdAt.toMillis() >= oneDayAgo
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hey, {profile?.name ?? 'there'} 👋</Text>
<Text style={styles.subGreeting}>
  {isFaculty ? 'Faculty' : profile?.enrollmentNumber ?? ''}
</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{classesToday}</Text>
            <Text style={styles.statLabel}>Classes Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loaded ? `${overallPercentage}%` : '—'}</Text>
            <Text style={styles.statLabel}>Attendance</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{newNoticesCount}</Text>
            <Text style={styles.statLabel}>New Notices</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.grid}>
          {quickLinks.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.gridItem}
              onPress={() => navigation.navigate(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name={item.icon} size={24} color={colors.primary} />
              </View>
              <Text style={styles.gridLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.lg },
  greeting: { ...typography.h1, color: colors.textPrimary },
  subGreeting: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { ...typography.h2, color: colors.primary },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#EAF0FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  gridLabel: { ...typography.caption, color: colors.textPrimary, textAlign: 'center', fontWeight: '600' },
});
