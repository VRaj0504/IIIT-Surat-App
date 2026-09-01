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
import { useAuth } from '../context/AuthContext';
import { getCurrentSemester } from '../utils/academicInfo';
import { subscribeToTimetable, Timetable } from '../firebase/timetableService';
import { subscribeToNotices, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type Tile = { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList; tint: string };
type Section = { title: string; tiles: Tile[] };

// Grouped by what someone is actually trying to DO, rather than one flat
// 14-18 tile grid where everything competes equally for attention. The
// eye can skip straight to the right section instead of scanning every
// tile. Kept expanded (not collapsible) deliberately — collapsing would
// add a tap before every action and hide things people are hunting for.
const studentSections: Section[] = [
  {
    title: 'Academics',
    tiles: [
      { label: 'My Attendance', icon: 'calendar-outline', route: 'MyAttendance', tint: '#0B3D91' },
      { label: 'Transcript', icon: 'school-outline', route: 'Transcript', tint: '#22A559' },
      { label: 'CGPA Calculator', icon: 'calculator-outline', route: 'CGPACalculator', tint: '#22A559' },
      { label: 'Resources', icon: 'book-outline', route: 'Resources', tint: '#0EA5E9' },
      { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', tint: '#F5A623' },
    ],
  },
  {
    title: 'Mess & Food',
    tiles: [
      { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', tint: '#E5484D' },
      { label: 'Order Food', icon: 'fast-food-outline', route: 'MessOrder', tint: '#E5484D' },
      { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', tint: '#E5484D' },
    ],
  },
  {
    title: 'Campus',
    tiles: [
      { label: 'Announcements', icon: 'notifications-outline', route: 'Announcements', tint: '#8B5CF6' },
      { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', tint: '#8B5CF6' },
      { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty', tint: '#F97316' },
      { label: 'Scan Event Poster', icon: 'scan-outline', route: 'ScanPoster', tint: '#F97316' },
      { label: 'Placements', icon: 'briefcase-outline', route: 'Placement', tint: '#EC4899' },
    ],
  },
  {
    title: 'Requests',
    tiles: [
      { label: 'Apply for Leave', icon: 'document-text-outline', route: 'ApplyLeave', tint: '#0EA5E9' },
      { label: 'Event Excusal', icon: 'megaphone-outline', route: 'SubmitEventExcusal', tint: '#0EA5E9' },
    ],
  },
];

// Faculty see their own tools FIRST (that's what they open the app for),
// then the shared campus/mess features below.
const facultySections: Section[] = [
  {
    title: 'Faculty Tools',
    tiles: [
      { label: 'Mark Attendance', icon: 'checkbox-outline', route: 'MarkAttendance', tint: '#0B3D91' },
      { label: 'Enter Grades', icon: 'create-outline', route: 'GradeEntry', tint: '#22A559' },
      { label: 'Leave Requests', icon: 'mail-open-outline', route: 'LeaveRequests', tint: '#0B3D91' },
      { label: 'Announcements', icon: 'notifications-outline', route: 'Announcements', tint: '#8B5CF6' },
      { label: 'Excusal Requests', icon: 'megaphone-outline', route: 'EventExcusalRequests', tint: '#0B3D91' },
    ],
  },
  {
    title: 'Mess Counter',
    tiles: [
      { label: 'Scan Thali Pass', icon: 'scan-circle-outline', route: 'ScanThaliPass', tint: '#22A559' },
      { label: 'Mess Counter', icon: 'qr-code-outline', route: 'MessStaff', tint: '#22A559' },
    ],
  },
  {
    title: 'Academics',
    tiles: [
      { label: 'Resources', icon: 'book-outline', route: 'Resources', tint: '#0EA5E9' },
      { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', tint: '#F5A623' },
    ],
  },
  {
    title: 'Campus',
    tiles: [
      { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty', tint: '#F97316' },
      { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', tint: '#8B5CF6' },
      { label: 'Scan Event Poster', icon: 'scan-outline', route: 'ScanPoster', tint: '#F97316' },
      { label: 'Placements', icon: 'briefcase-outline', route: 'Placement', tint: '#EC4899' },
      { label: 'Apply for Leave', icon: 'document-text-outline', route: 'ApplyLeave', tint: '#0EA5E9' },
    ],
  },
  {
    title: 'Mess & Food',
    tiles: [
      { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', tint: '#E5484D' },
      { label: 'Order Food', icon: 'fast-food-outline', route: 'MessOrder', tint: '#E5484D' },
      { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', tint: '#E5484D' },
    ],
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
  const isFaculty = profile?.role === 'faculty';
  const sections = isFaculty ? facultySections : studentSections;

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
                <Text style={styles.statValue}>{newNoticesCount}</Text>
                <Text style={styles.statLabel}>New{'\n'}Notices</Text>
              </View>
            </View>
          </GlassCard>

          {sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.grid}>
                {section.tiles.map((item) => (
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
            </View>
          ))}
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
  // marginTop added now that these repeat per section — without it the
  // groups run together and the headers stop reading as dividers.
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.md, marginLeft: spacing.xs },
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