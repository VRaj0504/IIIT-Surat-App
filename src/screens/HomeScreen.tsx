import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import ClayCard from '../components/ClayCard';
import GlassCard from '../components/GlassCard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import { useAttendance } from '../hooks/useAttendance';
import { useAuth } from '../context/AuthContext';
import { getCurrentSemester } from '../utils/academicInfo';
import { subscribeToTimetable, Timetable } from '../firebase/timetableService';
import { subscribeToNotices, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const quickLinks: { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList; tint: string }[] = [
  { label: 'Attendance', icon: 'checkmark-done-outline', route: 'Attendance', tint: '#0B3D91' },
  { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', tint: '#E5484D' },
  { label: 'CGPA Calculator', icon: 'calculator-outline', route: 'CGPACalculator', tint: '#22A559' },
  { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', tint: '#F5A623' },
  { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', tint: '#8B5CF6' },
  { label: 'Resources', icon: 'book-outline', route: 'Resources', tint: '#0EA5E9' },
  { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty', tint: '#F97316' },
  { label: 'Placements', icon: 'briefcase-outline', route: 'Placement', tint: '#EC4899' },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
  const isFaculty = profile?.role === 'faculty';
  const { overallPercentage, loaded } = useAttendance();

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const [timetable, setTimetableState] = useState<Timetable | null>(null);
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear) : null;
  useEffect(() => {
    if (!profile?.branch || !profile?.section || !semester) return;
    const unsubscribe = subscribeToTimetable(profile.branch, semester, profile.section, setTimetableState);
    return () => unsubscribe();
  }, [profile?.branch, profile?.section, semester]);
  const classesToday = timetable?.days.find((d) => d.day === todayName)?.slots.length ?? 0;

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
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Glass header */}
          <GlassCard style={styles.headerCard}>
            <View style={styles.headerInner}>
              <Text style={styles.greeting}>Hey, {profile?.name ?? 'there'} 👋</Text>
              <Text style={styles.subGreeting}>
                {isFaculty ? 'Faculty' : profile?.enrollmentNumber ?? ''}
              </Text>
            </View>
          </GlassCard>

          {/* Glass stat strip */}
          <GlassCard style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{classesToday}</Text>
                <Text style={styles.statLabel}>Classes{'\n'}Today</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{loaded ? `${overallPercentage}%` : '—'}</Text>
                <Text style={styles.statLabel}>Attendance</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{newNoticesCount}</Text>
                <Text style={styles.statLabel}>New{'\n'}Notices</Text>
              </View>
            </View>
          </GlassCard>

          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.grid}>
            {quickLinks.map((item) => (
              <ClayCard
                key={item.label}
                flat
                style={styles.gridInner}
                onPress={() => navigation.navigate(item.route as any)}
              >
                <View style={[styles.gridIconWrap, { backgroundColor: item.tint + '1A' }]}>
                  <Ionicons name={item.icon} size={22} color={item.tint} />
                </View>
                <Text style={styles.gridLabel}>{item.label}</Text>
              </ClayCard>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  headerCard: { marginBottom: spacing.sm },
  headerInner: { padding: spacing.lg },
  greeting: { ...typography.h1, color: colors.textPrimary },
  subGreeting: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  statsCard: { marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(0,0,0,0.08)' },
  statValue: { ...typography.h2, color: colors.primary },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center', lineHeight: 16 },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md, marginLeft: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-start' },
  gridInner: {
    width: '31%',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  gridIconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  gridLabel: { ...typography.caption, color: colors.textPrimary, textAlign: 'center', fontWeight: '600' },
});