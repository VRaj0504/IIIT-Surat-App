import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToExamSchedules, ExamSchedule, ExamEntry } from "../firebase/examScheduleService";
import LoadingSpinner from "../components/LoadingSpinner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "YYYY-MM-DD" -> a local-midnight Date. Built from the parts rather than
// new Date("2026-11-12"), which JS reads as UTC and can land on the
// previous day in some timezones.
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
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear) : null;

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

  const now = new Date();

  // Default to the exam type that still has something ahead of you, so a
  // student opening this the week of endsems doesn't land on last month's
  // finished midsem sheet.
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
          <Text style={styles.header}>Exam Schedule</Text>
          <Text style={styles.subtitle}>
            {profile?.branch && semester ? `${profile.branch} · Semester ${semester}` : "Your semester's exam dates"}
          </Text>

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
              <Text style={styles.emptyText}>No exam date sheet published for your semester yet.</Text>
              <Text style={styles.emptyHint}>You'll get a notification when faculty publishes one.</Text>
            </View>
          ) : (
            <>
              {schedules.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
                </ScrollView>
              )}

              {activeSchedule.sourcePdfUrl ? (
                <TouchableOpacity
                  style={styles.pdfButton}
                  onPress={() =>
                    Linking.openURL(activeSchedule.sourcePdfUrl as string).catch(() =>
                      Alert.alert("Couldn't open the PDF", "Try again in a moment."),
                    )
                  }
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  <Text style={styles.pdfButtonText}>Open the official date sheet</Text>
                </TouchableOpacity>
              ) : null}

              {nextExam ? (
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
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  emptyHint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  chips: { gap: spacing.sm, paddingBottom: spacing.md },
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
  chipTextSelected: { color: "#fff" },
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
  nextLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)", letterSpacing: 0.6 },
  nextTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginTop: 4 },
  nextMeta: { ...typography.caption, color: "rgba(255,255,255,0.85)", marginTop: 4 },
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
});
