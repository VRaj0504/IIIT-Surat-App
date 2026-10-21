import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Pressable, BackHandler } from 'react-native';
import { Portal } from '../components/Portal';
import Animated, { SlideInDown, SlideOutDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import TapCard from '../components/TapCard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getCurrentSemester } from '../utils/academicInfo';
import {
  subscribeToTimetable,
  subscribeToFacultyTimetable,
  Timetable,
  TimetableSlot,
  FacultyScheduleEntry,
} from '../firebase/timetableService';
import { mergeContiguousSlots, toMinutes } from '../utils/timetable';
import { subscribeToExamSchedules, ExamSchedule } from '../firebase/examScheduleService';
import { subscribeToHolidayOverrides } from '../firebase/holidayOverridesService';
import { getDayStatus } from '../utils/dayStatus';
import { subscribeToNotices, Notice } from '../firebase/noticesService';
import { useWebLayout } from '../utils/useWebLayout';
import { expandFaculty } from '../data/facultyLegend';
import { subscribeToActiveSos, SosAlert } from '../firebase/sosService';
import { useAttendanceSummary } from '../hooks/useAttendanceSummary';
import { ATTENDANCE_TARGET } from '../firebase/attendanceService';

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
      { label: 'Empty Classes', icon: 'business-outline', route: 'RoomAvailability', badge: 'green' },
    ],
  },
  {
    title: 'Wellness',
    tiles: [
      { label: 'Emergency SOS', icon: 'alert-circle-outline', route: 'SOS', badge: 'pink' },
      { label: 'Counselling & Wellness', icon: 'heart-outline', route: 'Counselling', badge: 'pink' },
    ],
  },
  {
    title: 'Mess & Food',
    tiles: [
      { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', badge: 'pink' },
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
      { label: 'SOS Alerts', icon: 'alert-circle-outline', route: 'SosAlerts', badge: 'pink' },
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
    ],
  },
  {
    title: 'Academics',
    tiles: [
      { label: 'Mark Attendance', icon: 'checkmark-done-outline', route: 'MarkAttendance', badge: 'green' },
      { label: 'Resources', icon: 'book-outline', route: 'Resources', badge: 'blue' },
      { label: 'Academic Calendar', icon: 'calendar-outline', route: 'AcademicCalendar', badge: 'peach' },
      { label: 'Empty Classes', icon: 'business-outline', route: 'RoomAvailability', badge: 'green' },
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
      { label: 'Mess Menu', icon: 'restaurant-outline', route: 'MessMenu', badge: 'pink' },
    ],
  },
];

type Slot = TimetableSlot & { branch?: string; semester?: number; section?: string };

// Bento tiles under the class card (UI canvas direction C): one tall tile
// for the thing people open the app for most, two small ones beside it,
// then quick chips. Everything else stays in the grouped grid below.
type ToneKey = keyof typeof colors.tile;
type BentoTile = { label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList; tone: ToneKey };
type QuickItem = { label: string; icon: keyof typeof Ionicons.glyphMap; route: keyof RootStackParamList; tone: ToneKey };
type Bento = { big: BentoTile; small: [BentoTile, BentoTile]; chips: QuickItem[] };

const studentBento: Bento = {
  big: { label: 'Attendance', sub: 'Your % in every subject', icon: 'checkmark-done-outline', route: 'MyAttendance', tone: 'mint' },
  small: [
    { label: 'Resources', sub: 'Notes & papers', icon: 'book-outline', route: 'Resources', tone: 'blue' },
    { label: 'Empty classes', sub: 'Find an empty class', icon: 'business-outline', route: 'RoomAvailability', tone: 'lilac' },
  ],
  // One tap from Home — the things people open most that aren't above.
  chips: [
    { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', tone: 'blue' },
    { label: 'Thali Pass', icon: 'qr-code-outline', route: 'ThaliPass', tone: 'peach' },
    { label: 'Exams', icon: 'document-text-outline', route: 'ExamSchedule', tone: 'lilac' },
    { label: 'Leave', icon: 'mail-outline', route: 'ApplyLeave', tone: 'mint' },
  ],
};
const facultyBento: Bento = {
  big: { label: 'Leave requests', sub: 'Medical & casual', icon: 'mail-open-outline', route: 'LeaveRequests', tone: 'mint' },
  small: [
    { label: 'Empty classes', sub: 'Find an empty class', icon: 'business-outline', route: 'RoomAvailability', tone: 'lilac' },
    { label: 'Scan pass', sub: 'Mess counter', icon: 'scan-circle-outline', route: 'ScanThaliPass', tone: 'peach' },
  ],
  chips: [
    { label: 'Attendance', icon: 'checkmark-done-outline', route: 'MarkAttendance', tone: 'mint' },
    { label: 'Lost & Found', icon: 'search-outline', route: 'LostFound', tone: 'blue' },
    { label: 'Announce', icon: 'notifications-outline', route: 'Announcements', tone: 'lilac' },
    { label: 'Complaints', icon: 'alert-circle-outline', route: 'Complaints', tone: 'peach' },
  ],
};

function to12h(time: string): string {
  const m = toMinutes(time);
  if (m < 0) return time;
  const h = Math.floor(m / 60);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m % 60).padStart(2, '0')}`;
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

// Re-renders every 30 s so "in 8 min" / "now" stay true without a reload.
function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function HomeScreen() {
  const { isDesktop } = useWebLayout();
  const navigation = useNavigation<NavProp>();
  const { profile, previewRole, setInCabin } = useAuth();
  const isFaculty = (previewRole ?? profile?.role) === 'faculty';
  const attendance = useAttendanceSummary(profile, !isFaculty);
  const sections = isFaculty ? facultySections : studentSections;
  const bento = isFaculty ? facultyBento : studentBento;
  const now = useNow();

  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  // Student: their section's timetable. Faculty: their own teaching slots,
  // derived from every section's timetable (same as the Timetable tab).
  const [timetable, setTimetableState] = useState<Timetable | null>(null);
  const [facultyEntries, setFacultyEntries] = useState<FacultyScheduleEntry[]>([]);
  useEffect(() => {
    if (isFaculty) {
      if (!profile?.name) return;
      const unsubscribe = subscribeToFacultyTimetable(profile.name, setFacultyEntries);
      return () => unsubscribe();
    }
    if (!profile?.branch || !profile?.section || !semester) return;
    const unsubscribe = subscribeToTimetable(profile.branch, semester, profile.section, setTimetableState);
    return () => unsubscribe();
  }, [isFaculty, profile?.name, profile?.branch, profile?.section, semester]);

  const todaySlots: Slot[] = useMemo(() => {
    const raw: Slot[] = isFaculty
      ? facultyEntries.filter((e) => e.day === todayName)
      : timetable?.days.find((d) => d.day === todayName)?.slots ?? [];
    return mergeContiguousSlots(raw).filter((s) => toMinutes(s.startTime) >= 0);
  }, [isFaculty, facultyEntries, timetable, todayName]);

  // A holiday, or a class's exam period, replaces the class card.
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.branch || !semester) return;
    const unsubscribe = subscribeToExamSchedules(profile.branch, semester, setExamSchedules);
    return () => unsubscribe();
  }, [isFaculty, profile?.branch, semester]);
  // Ad-hoc holidays (an email circular someone typed into the portal,
  // not on the fixed annual list) — relevant to everyone regardless of
  // role, unlike exam period above, so this isn't gated on isFaculty.
  const [holidayOverrides, setHolidayOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    const unsubscribe = subscribeToHolidayOverrides(setHolidayOverrides);
    return () => unsubscribe();
  }, []);
  const dayStatus = getDayStatus(now, isFaculty ? [] : examSchedules, holidayOverrides);

  // Faculty-only quick toggle — see setInCabin in AuthContext.tsx.
  const [cabinBusy, setCabinBusy] = useState(false);
  const handleToggleCabin = async () => {
    setCabinBusy(true);
    try {
      await setInCabin(!profile?.inCabin);
    } catch (err: any) {
      Alert.alert("Couldn't update", err.message ?? 'Please try again.');
    } finally {
      setCabinBusy(false);
    }
  };

  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    // Same viewer-scoping as NoticesScreen.tsx.
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
  // Responders (doctor, wardens, admins) see a red banner while any SOS is
  // open. Everyone else's read is refused by the rules — then it stays empty.
  const [activeSos, setActiveSos] = useState<SosAlert[]>([]);
  useEffect(() => {
    if (!isFaculty && (profile?.role as string) !== 'admin' && !profile?.isAdmin) return;
    return subscribeToActiveSos(setActiveSos, () => setActiveSos([]));
  }, [isFaculty, profile?.role, profile?.isAdmin]);

  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const newNoticesCount = notices.filter((n) => n.createdAt && n.createdAt.toMillis() >= oneDayAgo).length;

  // ---- what the hero card shows ----
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = todaySlots.find((s) => toMinutes(s.startTime) <= nowMin && nowMin < toMinutes(s.endTime));
  const upcoming = todaySlots.filter((s) => toMinutes(s.startTime) > nowMin);
  const hero = current ?? upcoming[0] ?? null;
  // Labs split into Group 1 / Group 2 run in parallel; a student is in
  // one of them but the timetable doesn't say which, so the card shows
  // every group running at that time (and counts it as ONE period).
  const heroGroup = hero ? todaySlots.filter((s) => toMinutes(s.startTime) === toMinutes(hero.startTime)) : [];
  const parallel = heroGroup.length > 1;
  const later = upcoming.filter((s) => !heroGroup.includes(s)).slice(0, 3);
  const periodKey = (s: Slot) => `${toMinutes(s.startTime)}|${toMinutes(s.endTime)}`;
  const total = new Set(todaySlots.map(periodKey)).size;
  const doneCount = new Set(todaySlots.filter((s) => toMinutes(s.endTime) <= nowMin).map(periodKey)).size;

  let heroChip = '';
  if (hero && hero === current) heroChip = `ends in ${minutesLabel(toMinutes(hero.endTime) - nowMin)}`;
  else if (hero) {
    const until = toMinutes(hero.startTime) - nowMin;
    heroChip = until <= 90 ? `in ${minutesLabel(until)}` : `at ${to12h(hero.startTime)}`;
  }

  const firstName = (profile?.name ?? '').replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').split(' ')[0] || 'there';
  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const goTimetable = () => navigation.navigate('Timetable' as any);

  const slotWho = (s: Slot) =>
    isFaculty
      ? [s.branch, s.semester ? `Sem ${s.semester}` : null, s.section && s.section !== s.branch ? s.section : null]
          .filter(Boolean)
          .join(' · ')
      : expandFaculty(s.faculty ?? '');


  const go = (route: keyof RootStackParamList) => navigation.navigate(route as any);

  // Which category sheet is open (null = none). Opening one is a single
  // native-driven slide; navigating closes it first so the next screen's
  // own slide-in plays cleanly.
  const [openSection, setOpenSection] = useState<Section | null>(null);
  // Biggest categories first; a one-tool category ends up last (and wide).
  const exploreSections = useMemo(() => [...sections].sort((a, b) => b.tiles.length - a.tiles.length), [sections]);
  // Leaving Home any other way (a notification tap, say) closes the sheet too.
  useFocusEffect(
    React.useCallback(() => () => setOpenSection(null), []),
  );
  const openFromSheet = (route: keyof RootStackParamList) => {
    setOpenSection(null);
    setTimeout(() => go(route), 180);
  };

  const classesLabel = dayStatus
    ? dayStatus.label
    : total > 0
      ? `${total} ${total === 1 ? 'class' : 'classes'} today`
      : 'No classes today';
  const weekday = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const initials = (profile?.name ?? '')
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollDesktop]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header (C) */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting} numberOfLines={1}>
                Hi, {firstName}
              </Text>
              <Text style={styles.subGreeting}>
                {weekday} · {classesLabel}
              </Text>
            </View>
            {!isFaculty && (
              <TapCard style={styles.sosPill} onPress={() => go('SOS')} accessibilityLabel="Emergency SOS">
                <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
                <Text style={styles.sosPillText}>SOS</Text>
              </TapCard>
            )}
            <TapCard style={styles.avatar} onPress={() => go('Profile' as any)} accessibilityLabel="Profile">
              <Text style={styles.avatarText}>{initials || '?'}</Text>
            </TapCard>
          </View>

          {activeSos.length > 0 && (
            <TapCard style={styles.sosBanner} onPress={() => go('SosAlerts')}>
              <Ionicons name="alert-circle" size={22} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sosBannerTitle}>
                  {activeSos.length === 1 ? `SOS: ${activeSos[0].studentName}` : `${activeSos.length} active SOS alerts`}
                </Text>
                <Text style={styles.sosBannerSub}>Tap for location and phone</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </TapCard>
          )}

          {newNoticesCount > 0 && (
            <TapCard style={styles.noticePill} onPress={() => go('Notices' as any)}>
              <View style={styles.noticeDot} />
              <Text style={styles.noticeText}>
                {newNoticesCount} new {newNoticesCount === 1 ? 'notice' : 'notices'} today
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TapCard>
          )}

          {isFaculty && (
            <TouchableOpacity
              style={[styles.cabinToggle, profile?.inCabin && { backgroundColor: colors.tile.mint.bg }]}
              onPress={handleToggleCabin}
              disabled={cabinBusy}
              activeOpacity={0.8}
            >
              <View style={[styles.cabinDot, { backgroundColor: profile?.inCabin ? colors.success : colors.textSecondary }]} />
              <Text style={[styles.cabinText, profile?.inCabin && { color: colors.tile.mint.fg }]}>
                {profile?.inCabin ? 'In cabin — students can see this in the directory' : 'Mark yourself as in cabin'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Next / current class (C pastel tile) */}
          <TapCard style={styles.next} onPress={goTimetable}>
            {dayStatus ? (
              <>
                <Text style={styles.nextKicker}>Today</Text>
                <Text style={styles.nextTitle}>{dayStatus.label}</Text>
                <Text style={styles.nextSub}>No regular classes today.</Text>
              </>
            ) : hero ? (
              <>
                <View style={styles.nextTop}>
                  <Text style={styles.nextKicker}>
                    {hero === current ? 'Current class' : 'Next class'} · {to12h(hero.startTime)}
                  </Text>
                  <View style={styles.nextPill}>
                    <Text style={styles.nextPillText}>{heroChip}</Text>
                  </View>
                </View>
                <Text style={styles.nextTitle} numberOfLines={2}>
                  {parallel
                    ? Array.from(new Set(heroGroup.map((s) => s.subjectName || s.subjectCode))).join(' / ')
                    : `${hero.subjectName || hero.subjectCode}${hero.room ? ` in ${hero.room}` : ''}`}
                </Text>
                <Text style={styles.nextSub} numberOfLines={2}>
                  {parallel
                    ? heroGroup
                        .map((g) => `${(g.group ?? '').replace(/group\s*/i, 'G') || g.subjectCode}: ${g.room}`)
                        .join('  ·  ')
                    : [
                        hero.subjectCode,
                        isFaculty ? slotWho(hero) : expandFaculty(hero.faculty ?? ''),
                        `${to12h(hero.startTime)}–${to12h(hero.endTime)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
                {total > 0 && (
                  <View style={styles.nextProgressRow}>
                    <View style={styles.nextTrack}>
                      <View style={[styles.nextFill, { width: `${Math.round((doneCount / total) * 100)}%` }]} />
                    </View>
                    <Text style={styles.nextMeta}>
                      {doneCount}/{total} done
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.nextKicker}>Today</Text>
                <Text style={styles.nextTitle}>{total > 0 ? "That's all for today" : 'No classes today'}</Text>
                <Text style={styles.nextSub}>Tap to see your week.</Text>
              </>
            )}
          </TapCard>

          {/* Big tiles (C bento) */}
          <View style={styles.bentoRow}>
            <TapCard
              style={[styles.bentoBig, { backgroundColor: colors.tile[bento.big.tone].bg }]}
              onPress={() => go(bento.big.route)}
            >
              <View style={styles.bentoIconBig}>
                <Ionicons name={bento.big.icon} size={30} color={colors.tile[bento.big.tone].fg} />
              </View>
              {bento.big.route === 'MyAttendance' ? (
                // Students: the overall % right on the tile.
                <View>
                  {attendance?.overall != null && (
                    <Text
                      style={[
                        styles.bentoPct,
                        { color: attendance.overall < ATTENDANCE_TARGET ? colors.danger : colors.tile[bento.big.tone].fg },
                      ]}
                    >
                      {attendance.overall}%
                    </Text>
                  )}
                  <Text style={[styles.bentoTitle, { color: colors.tile[bento.big.tone].fg }]}>{bento.big.label}</Text>
                  <Text style={[styles.bentoSub, attendance?.low ? { color: colors.danger } : null]}>
                    {attendance?.overall == null
                      ? attendance
                        ? 'No classes marked yet'
                        : bento.big.sub
                      : attendance.low
                        ? `Below ${ATTENDANCE_TARGET}% in ${attendance.low} subject${attendance.low > 1 ? 's' : ''}`
                        : 'Overall this semester'}
                  </Text>
                </View>
              ) : (
                <View>
                  <Text style={[styles.bentoTitle, { color: colors.tile[bento.big.tone].fg }]}>{bento.big.label}</Text>
                  <Text style={styles.bentoSub}>{bento.big.sub}</Text>
                </View>
              )}
            </TapCard>
            <View style={styles.bentoCol}>
              {bento.small.map((t) => (
                <TapCard
                  key={t.label}
                  style={[styles.bentoSmall, { backgroundColor: colors.tile[t.tone].bg }]}
                  onPress={() => go(t.route)}
                >
                  <Ionicons name={t.icon} size={24} color={colors.tile[t.tone].fg} />
                  <View>
                    <Text style={[styles.bentoSmallTitle, { color: colors.tile[t.tone].fg }]}>{t.label}</Text>
                    <Text style={styles.bentoSub} numberOfLines={1}>
                      {t.sub}
                    </Text>
                  </View>
                </TapCard>
              ))}
            </View>
          </View>

          {/* Quick access — one tap, no folder */}
          <View style={styles.quickRow}>
            {bento.chips.map((c) => (
              <TapCard key={c.label} style={styles.quickItem} onPress={() => go(c.route)} accessibilityLabel={c.label}>
                <View style={[styles.quickIcon, { backgroundColor: colors.tile[c.tone].bg }]}>
                  <Ionicons name={c.icon} size={22} color={colors.tile[c.tone].fg} />
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  {c.label}
                </Text>
              </TapCard>
            ))}
          </View>

          {/* Later today */}
          {!dayStatus && later.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Later today</Text>
                <TouchableOpacity onPress={goTimetable} hitSlop={8}>
                  <Text style={styles.link}>Full timetable</Text>
                </TouchableOpacity>
              </View>
              {later.map((s, i) => (
                <View key={`${s.id}-${i}`} style={styles.laterRow}>
                  <Text style={styles.laterTime}>{to12h(s.startTime)}</Text>
                  <View style={[styles.laterBar, i === 0 && { backgroundColor: colors.tile.blue.fg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.laterTitle} numberOfLines={1}>
                      {s.subjectName || s.subjectCode}
                      {s.group ? ` · ${s.group}` : ''}
                    </Text>
                    <Text style={styles.laterMeta} numberOfLines={1}>
                      {[s.room, slotWho(s)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Everything else, grouped (C bento categories) */}
          <Text style={styles.exploreTitle}>Explore</Text>
          <View style={styles.catGrid}>
            {exploreSections.map((section, i) => {
              const tone = colors.tile[toneForSection(section.title, i)];
              const wide = exploreSections.length % 2 === 1 && i === exploreSections.length - 1;
              return (
                <TapCard
                  key={section.title}
                  style={[styles.catCard, { backgroundColor: tone.bg }, wide && styles.catCardWide]}
                  onPress={() => (section.tiles.length === 1 ? go(section.tiles[0].route) : setOpenSection(section))}
                  accessibilityLabel={`${section.title}, ${section.tiles.length} items`}
                >
                  <View style={styles.catIcons}>
                    {section.tiles.slice(0, wide ? 5 : 3).map((t) => (
                      <View key={t.label} style={styles.catIcon}>
                        <Ionicons name={t.icon} size={17} color={tone.fg} />
                      </View>
                    ))}
                  </View>
                  <View>
                    <Text style={[styles.catTitle, { color: tone.fg }]}>{section.title}</Text>
                    <Text style={styles.catMeta} numberOfLines={1}>
                      {section.tiles.length === 1
                        ? section.tiles[0].label
                        : `${section.tiles.length} tools · ${section.tiles
                            .slice(0, 2)
                            .map((t) => t.label)
                            .join(', ')}…`}
                    </Text>
                  </View>
                </TapCard>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      <CategorySheet section={openSection} onClose={() => setOpenSection(null)} onOpen={openFromSheet} />
    </View>
  );
}

// Category colours: same category, same colour, everywhere.
const SECTION_TONES: Record<string, ToneKey> = {
  Academics: 'blue',
  Requests: 'lilac',
  Campus: 'mint',
  'Mess & Food': 'peach',
  Wellness: 'pink',
  'Faculty Tools': 'blue',
  'Mess Counter': 'peach',
};
const FALLBACK_TONES: ToneKey[] = ['blue', 'mint', 'lilac', 'peach', 'pink', 'yellow'];
function toneForSection(title: string, i: number): ToneKey {
  return SECTION_TONES[title] ?? FALLBACK_TONES[i % FALLBACK_TONES.length];
}

// A category's tools in a sheet that slides up from the bottom — one
// native slide, nothing staggered.
function CategorySheet({
  section,
  onClose,
  onOpen,
}: {
  section: Section | null;
  onClose: () => void;
  onOpen: (route: keyof RootStackParamList) => void;
}) {
  const tone = section ? colors.tile[toneForSection(section.title, 0)] : colors.tile.blue;
  const insets = useSafeAreaInsets();
  // Android back button closes the sheet instead of leaving the screen.
  useEffect(() => {
    if (!section) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [section, onClose]);

  return (
    // Drawn through <Portal> (above the whole app, tab bar included) rather
    // than <Modal>: see src/components/Portal.tsx.
    <Portal>
      {section && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(260)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetBadge, { backgroundColor: tone.bg }]}>
                <Ionicons name={section.tiles[0]?.icon ?? 'apps-outline'} size={20} color={tone.fg} />
              </View>
              <Text style={styles.sheetTitle}>{section.title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.sheetClose} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetGrid}>
              {section.tiles.map((t) => (
                <TapCard key={t.label} style={[styles.sheetItem, { backgroundColor: tone.bg }]} onPress={() => onOpen(t.route)}>
                  <Ionicons name={t.icon} size={24} color={tone.fg} />
                  <Text style={[styles.sheetItemText, { color: tone.fg }]} numberOfLines={2}>
                    {t.label}
                  </Text>
                </TapCard>
              ))}
            </View>
          </Animated.View>
        </View>
      )}
    </Portal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: spacing.md, paddingBottom: 110, gap: 12 },
  scrollDesktop: { maxWidth: 960, width: '100%', alignSelf: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 4 },
  greeting: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: colors.textPrimary },
  subGreeting: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onInk, fontWeight: '800', fontSize: 16 },

  sosPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#DC2626',
  },
  sosPillText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  sosBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#DC2626',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sosBannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  sosBannerSub: { color: '#FECACA', fontSize: 12, fontWeight: '700', marginTop: 1 },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  noticeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  noticeText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  cabinToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  cabinDot: { width: 10, height: 10, borderRadius: 5 },
  cabinText: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, flex: 1 },

  next: { backgroundColor: colors.tile.blue.bg, borderRadius: 26, padding: 18, gap: 6 },
  nextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextKicker: { fontSize: 13, fontWeight: '800', color: colors.tile.blue.fg },
  nextPill: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  nextPillText: { fontSize: 13, fontWeight: '800', color: colors.tile.blue.fg },
  nextTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, lineHeight: 31, color: colors.textPrimary, marginTop: 14 },
  nextSub: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  nextProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  nextTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(29,63,168,0.15)', overflow: 'hidden' },
  nextFill: { height: 6, borderRadius: 3, backgroundColor: colors.tile.blue.fg },
  nextMeta: { fontSize: 12, fontWeight: '800', color: colors.tile.blue.fg },

  bentoRow: { flexDirection: 'row', gap: 12, height: 220 },
  bentoBig: { flex: 1, borderRadius: 26, padding: 18, justifyContent: 'space-between' },
  bentoIconBig: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoCol: { flex: 1, gap: 12 },
  bentoSmall: { flex: 1, borderRadius: 26, padding: 16, justifyContent: 'space-between' },
  bentoPct: { fontSize: 38, fontWeight: '800', letterSpacing: -1.2, marginBottom: 2 },
  bentoTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  bentoSmallTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  bentoSub: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

  card: { backgroundColor: colors.background, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
  laterRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  laterTime: { width: 44, fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  laterBar: { width: 3, height: 34, borderRadius: 2, backgroundColor: colors.border },
  laterTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  laterMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },


  exploreTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 10 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catCard: { width: '48%', flexGrow: 1, minHeight: 140, borderRadius: 24, padding: 16, justifyContent: 'space-between', gap: 14 },
  catCardWide: { width: '100%', minHeight: 110 },
  catIcons: { flexDirection: 'row', gap: 6 },
  catIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  catMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: colors.background,
  },
  quickIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },

  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,26,51,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  sheetGrabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetBadge: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheetItem: { width: '31%', minHeight: 100, borderRadius: 20, padding: 14, justifyContent: 'space-between', gap: 10 },
  sheetItemText: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
});
