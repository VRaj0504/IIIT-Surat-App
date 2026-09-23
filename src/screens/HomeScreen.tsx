import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { countClassPeriods } from '../utils/timetable';
import { subscribeToExamSchedules, ExamSchedule } from '../firebase/examScheduleService';
import { getDayStatus } from '../utils/dayStatus';
import { subscribeToNotices, Notice } from '../firebase/noticesService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// badge keys into colors.badge (theme.ts) — a real color-graded pair per
// category (peach/pink/green/blue/purple), not one hue at varying alpha
// like the old `tint: '#hex'` + `+ '1A'` suffix trick.
type BadgeKey = keyof typeof colors.badge;
type Tile = { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList; badge: BadgeKey };
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
      { label: 'My Attendance', icon: 'calendar-outline', route: 'MyAttendance', badge: 'blue' },
      { label: 'Transcript', icon: 'school-outline', route: 'Transcript', badge: 'green' },
      { label: 'Exam Schedule', icon: 'reader-outline', route: 'ExamSchedule', badge: 'peach' },
      { label: 'Resources', icon: 'book-outline', route: 'Resources', badge: 'blue' },
      { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', badge: 'peach' },
    ],
  },
  {
    title: 'Wellness',
    tiles: [
      { label: 'Counselling & Wellness', icon: 'heart-outline', route: 'Counselling', badge: 'pink' },
    ],
  },
  {
    title: 'Mess & Food',
    tiles: [
      { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', badge: 'pink' },
      { label: 'Order Food', icon: 'fast-food-outline', route: 'MessOrder', badge: 'pink' },
      { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', badge: 'pink' },
    ],
  },
  {
    title: 'Campus',
    tiles: [
      { label: 'Announcements', icon: 'notifications-outline', route: 'Announcements', badge: 'purple' },
      { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', badge: 'blue' },
      { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty', badge: 'peach' },
      { label: 'Scan Event Poster', icon: 'scan-outline', route: 'ScanPoster', badge: 'peach' },
      { label: 'Placements', icon: 'briefcase-outline', route: 'Placement', badge: 'purple' },
    ],
  },
  {
    title: 'Requests',
    tiles: [
      { label: 'Apply for Leave', icon: 'document-text-outline', route: 'ApplyLeave', badge: 'blue' },
      { label: 'Event Excusal', icon: 'megaphone-outline', route: 'SubmitEventExcusal', badge: 'blue' },
      { label: 'Complaints & Doubts', icon: 'alert-circle-outline', route: 'SubmitComplaint', badge: 'peach' },
    ],
  },
];

// Faculty see their own tools FIRST (that's what they open the app for),
// then the shared campus/mess features below.
const facultySections: Section[] = [
  {
    title: 'Faculty Tools',
    tiles: [
      { label: 'Leave Requests', icon: 'mail-open-outline', route: 'LeaveRequests', badge: 'blue' },
      { label: 'Announcements', icon: 'notifications-outline', route: 'Announcements', badge: 'purple' },
      { label: 'Excusal Requests', icon: 'megaphone-outline', route: 'EventExcusalRequests', badge: 'blue' },
      { label: 'Complaints & Doubts', icon: 'alert-circle-outline', route: 'Complaints', badge: 'peach' },
      { label: 'Counselling Requests', icon: 'heart-outline', route: 'CounsellingQueue', badge: 'pink' },
    ],
  },
  {
    title: 'Mess Counter',
    tiles: [
      { label: 'Scan Thali Pass', icon: 'scan-circle-outline', route: 'ScanThaliPass', badge: 'green' },
      { label: 'Mess Counter', icon: 'qr-code-outline', route: 'MessStaff', badge: 'green' },
    ],
  },
  {
    title: 'Academics',
    tiles: [
      { label: 'Resources', icon: 'book-outline', route: 'Resources', badge: 'blue' },
      { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', badge: 'peach' },
    ],
  },
  {
    title: 'Campus',
    tiles: [
      { label: 'Faculty Directory', icon: 'people-outline', route: 'Faculty', badge: 'peach' },
      { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', badge: 'blue' },
      { label: 'Scan Event Poster', icon: 'scan-outline', route: 'ScanPoster', badge: 'peach' },
      { label: 'Placements', icon: 'briefcase-outline', route: 'Placement', badge: 'purple' },
      { label: 'Apply for Leave', icon: 'document-text-outline', route: 'ApplyLeave', badge: 'blue' },
    ],
  },
  {
    title: 'Mess & Food',
    tiles: [
      { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', badge: 'pink' },
      { label: 'Order Food', icon: 'fast-food-outline', route: 'MessOrder', badge: 'pink' },
      { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', badge: 'pink' },
    ],
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, previewRole } = useAuth();
  const isFaculty = (previewRole ?? profile?.role) === 'faculty';
  const sections = isFaculty ? facultySections : studentSections;

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const [timetable, setTimetableState] = useState<Timetable | null>(null);
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear) : null;
  useEffect(() => {
    if (!profile?.branch || !profile?.section || !semester) return;
    const unsubscribe = subscribeToTimetable(profile.branch, semester, profile.section, setTimetableState);
    return () => unsubscribe();
  }, [profile?.branch, profile?.section, semester]);
  const todaySlots = timetable?.days.find((d) => d.day === todayName)?.slots ?? [];
  const classesToday = countClassPeriods(todaySlots);

  // A holiday, or a class's exam period, shows as that on the card below
  // instead of a class count for a timetable that isn't running today.
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.branch || !semester) return;
    const unsubscribe = subscribeToExamSchedules(profile.branch, semester, setExamSchedules);
    return () => unsubscribe();
  }, [isFaculty, profile?.branch, semester]);
  const dayStatus = getDayStatus(new Date(), isFaculty ? [] : examSchedules);

  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    // Same viewer-scoping as NoticesScreen.tsx — without this, a
    // student's "new notices" badge counted every notice posted
    // anywhere (including ones targeted at a completely different
    // branch/section), and missed the age-cutoff query path
    // subscribeToNotices uses when a real viewer is passed.
    const viewer =
      !isFaculty && profile
        ? {
            branch: profile.branch,
            section: profile.section,
            admissionYear: profile.admissionYear,
            specialization: profile.specialization,
          }
        : undefined;
    const unsubscribe = subscribeToNotices(setNotices, viewer);
    return () => unsubscribe();
  }, [isFaculty, profile?.branch, profile?.section, profile?.admissionYear, profile?.specialization]);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newNoticesCount = notices.filter(
    (n) => n.createdAt && n.createdAt.toMillis() >= oneDayAgo
  ).length;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <GlassCard style={styles.headerCard}>
              <View style={styles.headerInner}>
                <Text style={styles.greeting}>Hey, {profile?.name ?? 'there'}</Text>
                <Text style={styles.subGreeting}>
                  {isFaculty ? 'Faculty' : profile?.enrollmentNumber ?? ''}
                </Text>
              </View>
            </GlassCard>
          </Animated.View>

          {/* Stat cards use the same pastel badge backgrounds as the tile
              grid below, instead of a plain white card with colored text
              — color-graded, not just color-accented. */}
          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.statsRow}>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: colors.badge.peach.bg }]}
              onPress={() => navigation.navigate('Timetable' as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.statValue, { color: colors.badge.peach.fg }]}>{dayStatus ? dayStatus.short : classesToday}</Text>
              <Text style={[styles.statLabel, { color: colors.badge.peach.fg }]}>{dayStatus ? dayStatus.label : 'Classes today'}</Text>
            </TouchableOpacity>
            <View style={[styles.statCard, { backgroundColor: colors.badge.green.bg }]}>
              <Text style={[styles.statValue, { color: colors.badge.green.fg }]}>{newNoticesCount}</Text>
              <Text style={[styles.statLabel, { color: colors.badge.green.fg }]}>New notices</Text>
            </View>
          </Animated.View>

          {(() => {
            // One running counter across every section's every tile, so the
            // whole page cascades in top-to-bottom in one continuous wave
            // rather than each section restarting its own stagger from zero
            // (which would make section 2's first tile pop in alongside
            // section 1's fifth, breaking the top-to-bottom reading order).
            // Capped so a long tile list doesn't leave the last few tiles
            // waiting nearly a second to appear.
            let tileOrder = 0;
            return sections.map((section, sectionIndex) => {
              const total = section.tiles.length;
              const remainder = total % 3;
              return (
                <View key={section.title}>
                  <Animated.View entering={FadeInDown.delay(120 + sectionIndex * 40).duration(400)}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </Animated.View>
                  <View style={styles.grid}>
                    {section.tiles.map((item, index) => {
                      // A full multiple of 3 always fills evenly as-is. An
                      // incomplete last row (remainder 1 or 2) used to keep
                      // every tile at a fixed 31%, leaving a visibly empty
                      // gap where the missing tile(s) would've been — one
                      // lone tile stranded on the left, or two tiles with a
                      // blank rectangle where a third never comes. Instead,
                      // only the tiles actually IN that trailing row widen
                      // to split it evenly: one leftover tile takes the
                      // full row, two leftover tiles take half each.
                      const isTrailing = remainder !== 0 && index >= total - remainder;
                      const trailingWidth = remainder === 1 ? '100%' : '48%';
                      const badge = colors.badge[item.badge];
                      const delay = 140 + Math.min(tileOrder, 16) * 30;
                      tileOrder++;
                      return (
                        <Animated.View
                          key={item.label}
                          entering={FadeInDown.delay(delay).duration(350)}
                          style={[styles.gridItemWrap, isTrailing && { width: trailingWidth }]}
                        >
                          <ClayCard style={styles.gridInner} onPress={() => navigation.navigate(item.route as any)}>
                            <View style={[styles.gridIconWrap, { backgroundColor: badge.bg }]}>
                              <Ionicons name={item.icon} size={18} color={badge.fg} />
                            </View>
                            <Text
                              style={styles.gridLabel}
                              numberOfLines={2}
                              adjustsFontSizeToFit
                              minimumFontScale={0.75}
                            >
                              {item.label}
                            </Text>
                          </ClayCard>
                        </Animated.View>
                      );
                    })}
                  </View>
                </View>
              );
            });
          })()}
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
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: 'flex-start' },
  statValue: { ...typography.h1, marginBottom: 2 },
  statLabel: { ...typography.caption },
  // marginTop added now that these repeat per section — without it the
  // groups run together and the headers stop reading as dividers.
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.md, marginLeft: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-start' },
  // Holds the grid slot's WIDTH ('31%' / '48%' / '100%') — this is now the
  // actual flex child of `grid` (ClayCard sits inside it), so the
  // percentage resolves against the grid row as intended. ClayCard itself
  // gets no width; a View's default cross-axis stretch fills it.
  gridItemWrap: { width: '31%' },
  gridInner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
  },
  gridIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  gridLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    // Same fix as ClubIconTile.tsx: reserves a full 2 lines regardless
    // of whether this particular label wraps, so a 1-line label like
    // "Transcript" doesn't make a visibly shorter card than a 2-line
    // one like "CGPA Calculator" in the same row.
    lineHeight: typography.caption.fontSize * 1.3,
    minHeight: typography.caption.fontSize * 1.3 * 2,
  },
});
