import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToExamSchedules, ExamSchedule, ExamEntry } from "../firebase/examScheduleService";
import LoadingSpinner from "../components/LoadingSpinner";
import { openSafeUrl } from "../utils/safeLink";
import { subscribeToMyQuizzes, roomFor, Quiz } from "../firebase/quizService";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(iso: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseLocalDate(iso).getTime() - today.getTime()) / 86400000);
}

function formatTime(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function countdownLabel(days: number): string {
  if (days < 0) return "Done";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function ExamScheduleScreen() {
  const { profile } = useAuth();
  const [allSchedules, setSchedules] = useState<ExamSchedule[]>([]);
  const schedules = useMemo(() => {
    const now = new Date();
    return allSchedules.filter((s) => {
      if (s.entries.length > 0) return s.entries.some((e) => daysUntil(e.date, now) >= -1);
      const updated = s.updatedAt?.toMillis?.() ?? 0;
      return now.getTime() - updated < 60 * 86400000;
    });
  }, [allSchedules]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  useEffect(() => {
    if (!profile?.branch || !semester) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToExamSchedules(profile.branch, semester, (items) => {
      setSchedules(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.branch, semester]);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [openQuiz, setOpenQuiz] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.branch || !profile.admissionYear) return;
    return subscribeToMyQuizzes(
      { branch: profile.branch, admissionYear: profile.admissionYear, section: profile.section ?? null },
      setQuizzes,
    );
  }, [profile?.branch, profile?.admissionYear, profile?.section]);

  const now = new Date();

  const activeSchedule = useMemo(() => {
    const picked = schedules.find((s) => s.id === selectedId);
    if (picked) return picked;
    const upcoming = schedules.find((s) => s.entries.some((e) => daysUntil(e.date, new Date()) >= 0));
    return upcoming ?? schedules[0] ?? null;
  }, [schedules, selectedId]);

  const nextExam: ExamEntry | null = useMemo(() => {
    if (!activeSchedule) return null;
    return activeSchedule.entries.find((e) => daysUntil(e.date, new Date()) >= 0) ?? null;
  }, [activeSchedule]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            {profile?.branch && semester ? `${profile.branch} · Semester ${semester}` : "Your semester's exam dates"}
          </Text>

          {quizzes.length > 0 && (
            <View style={styles.quizBlock}>
              <Text style={styles.sectionLabel}>Upcoming quizzes</Text>
              {quizzes.map((q) => {
                const d = parseLocalDate(q.date);
                const mine = roomFor(q, profile?.enrollmentNumber);
                const expanded = openQuiz === q.id;
                const days = daysUntil(q.date, now);
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={styles.quizCard}
                    activeOpacity={0.85}
                    onPress={() => setOpenQuiz(expanded ? null : q.id)}
                  >
                    <View style={styles.quizTop}>
                      <View style={styles.quizDate}>
                        <Text style={styles.quizDay}>{d.getDate()}</Text>
                        <Text style={styles.quizMonth}>{MONTHS[d.getMonth()]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subjectName}>{q.title || `${q.subjectName} quiz`}</Text>
                        <Text style={styles.timeText}>
                          {WEEKDAYS[d.getDay()]} · {formatTime(q.startTime)}–{formatTime(q.endTime)} · {q.subjectCode}
                        </Text>
                      </View>
                      <Text style={[styles.countdown, days === 0 && styles.countdownToday]}>{countdownLabel(days)}</Text>
                    </View>
                    <View style={styles.myRoom}>
                      <Ionicons name="location-outline" size={16} color={mine ? colors.successFg : colors.textSecondary} />
                      <Text style={[styles.myRoomText, !mine && { color: colors.textSecondary }]}>
                        {mine ? `Your room: ${mine.room}` : q.rooms.length ? "Your room isn't listed — check with your teacher" : "Room not announced yet"}
                      </Text>
                    </View>
                    {expanded && (
                      <View style={styles.quizMore}>
                        {q.syllabus ? (
                          <>
                            <Text style={styles.quizMoreLabel}>Syllabus</Text>
                            <Text style={styles.quizMoreText}>{q.syllabus}</Text>
                          </>
                        ) : null}
                        {q.rooms.length > 0 && (
                          <>
                            <Text style={styles.quizMoreLabel}>Seating</Text>
                            {q.rooms.map((r) => (
                              <Text key={`${r.room}-${r.fromRegNo}`} style={styles.quizMoreText}>
                                {r.room}: {r.fromRegNo} – {r.toRegNo}
                              </Text>
                            ))}
                          </>
                        )}
                        {q.note ? <Text style={[styles.quizMoreText, { marginTop: spacing.sm }]}>{q.note}</Text> : null}
                        {q.createdByName ? <Text style={styles.subjectCode}>Posted by {q.createdByName}</Text> : null}
                      </View>
                    )}
                    <Text style={styles.quizHint}>{expanded ? "Tap to hide details" : "Tap for syllabus and seating"}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.sectionLabel}>Date sheet</Text>
            </View>
          )}

          {loading ? (
            <LoadingSpinner style={{ marginTop: spacing.xl }} />
          ) : !profile?.branch || !semester ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Your branch or admission year isn't set on your profile yet.</Text>
            </View>
          ) : !activeSchedule ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="reader-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No upcoming exam date sheet for your semester.</Text>
              <Text style={styles.emptyHint}>You'll get a notification when faculty publishes one.</Text>
            </View>
          ) : (
            <>
              {schedules.length > 1 && (
                <View style={styles.chips}>
                  {schedules.map((s) => {
                    const selected = s.id === activeSchedule.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => setSelectedId(s.id)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{s.examTypeLabel}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {activeSchedule.sourcePdfUrl ? (
                <TouchableOpacity
                  style={styles.pdfButton}
                  onPress={() =>
                    openSafeUrl(activeSchedule.sourcePdfUrl as string).catch(() =>
                      Alert.alert("Couldn't open the PDF", "Try again in a moment."),
                    )
                  }
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  <Text style={styles.pdfButtonText}>
                    {activeSchedule.entries.length === 0 ? "Open / download the date sheet" : "Open the official date sheet"}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {activeSchedule.entries.length === 0 ? (
                <Text style={styles.emptyHint}>
                  {activeSchedule.sourcePdfUrl
                    ? "Faculty shared the date sheet as a file. Tap above to open or download it."
                    : "No exams listed on this sheet yet."}
                </Text>
              ) : nextExam ? (
                <View style={styles.nextCard}>
                  <Text style={styles.nextLabel}>NEXT EXAM · {countdownLabel(daysUntil(nextExam.date, now)).toUpperCase()}</Text>
                  <Text style={styles.nextTitle}>{nextExam.subjectName || nextExam.subjectCode}</Text>
                  <Text style={styles.nextMeta}>
                    {WEEKDAYS[parseLocalDate(nextExam.date).getDay()]}, {parseLocalDate(nextExam.date).getDate()}{" "}
                    {MONTHS[parseLocalDate(nextExam.date).getMonth()]} · {formatTime(nextExam.startTime)}
                    {nextExam.venue ? ` · ${nextExam.venue}` : ""}
                  </Text>
                </View>
              ) : (
                <View style={styles.nextCard}>
                  <Text style={styles.nextLabel}>ALL DONE</Text>
                  <Text style={styles.nextTitle}>Every exam on this sheet is over.</Text>
                </View>
              )}

              {activeSchedule.entries.map((e, i) => {
                const date = parseLocalDate(e.date);
                const days = daysUntil(e.date, now);
                const past = days < 0;
                return (
                  <View key={`${e.date}-${e.subjectCode}-${i}`} style={[styles.examCard, past && styles.examCardPast]}>
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateDay}>{date.getDate()}</Text>
                      <Text style={styles.dateMonth}>{MONTHS[date.getMonth()]}</Text>
                      <Text style={styles.dateWeekday}>{WEEKDAYS[date.getDay()]}</Text>
                    </View>
                    <View style={styles.examBody}>
                      <Text style={styles.subjectName}>{e.subjectName || e.subjectCode}</Text>
                      {e.subjectName && e.subjectCode ? <Text style={styles.subjectCode}>{e.subjectCode}</Text> : null}
                      <Text style={styles.timeText}>
                        {formatTime(e.startTime)}
                        {e.endTime ? ` – ${formatTime(e.endTime)}` : ""}
                        {e.venue ? `  ·  ${e.venue}` : ""}
                      </Text>
                    </View>
                    <Text style={[styles.countdown, days === 0 && styles.countdownToday, past && styles.countdownPast]}>
                      {countdownLabel(days)}
                    </Text>
                  </View>
                );
              })}
              {activeSchedule.guidelines?.length ? (
                <View style={styles.guideCard}>
                  <Text style={styles.guideTitle}>Exam guidelines</Text>
                  {activeSchedule.guidelines.map((g, i) => (
                    <Text key={i} style={styles.guideLine}>{`${i + 1}. ${g}`}</Text>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guideCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  guideTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  guideLine: { ...typography.caption, color: colors.textSecondary },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  emptyHint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  chipTextSelected: { color: colors.onPrimary },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  pdfButtonText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  nextCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  nextLabel: { fontSize: 11, fontWeight: "700", color: colors.onPrimary, opacity: 0.75, letterSpacing: 0.6 },
  nextTitle: { fontSize: 20, fontWeight: "700", color: colors.onPrimary, marginTop: 4 },
  nextMeta: { ...typography.caption, color: colors.onPrimary, opacity: 0.85, marginTop: 4 },
  examCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...clayShadowSoft,
  },
  examCardPast: { opacity: 0.55 },
  dateBlock: {
    width: 56,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.badge.peach.bg,
  },
  dateDay: { fontSize: 22, fontWeight: "800", color: colors.badge.peach.fg },
  dateMonth: { fontSize: 12, fontWeight: "700", color: colors.badge.peach.fg },
  dateWeekday: { fontSize: 11, color: colors.badge.peach.fg },
  examBody: { flex: 1 },
  subjectName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  subjectCode: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  timeText: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  countdown: { fontSize: 12, fontWeight: "700", color: colors.primary },
  countdownToday: { color: colors.danger },
  countdownPast: { color: colors.textSecondary },
  quizBlock: { marginBottom: spacing.sm },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  quizCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  quizTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  quizDate: {
    width: 52,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.badge.blue.bg,
  },
  quizDay: { fontSize: 20, fontWeight: "800", color: colors.badge.blue.fg },
  quizMonth: { fontSize: 11, fontWeight: "700", color: colors.badge.blue.fg },
  myRoom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.successBg,
    alignSelf: "flex-start",
  },
  myRoomText: { fontSize: 13, fontWeight: "700", color: colors.successFg },
  quizMore: { marginTop: spacing.sm, gap: 2 },
  quizMoreLabel: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: spacing.sm },
  quizMoreText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  quizHint: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.sm },
});
