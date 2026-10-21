import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import {
  subscribeToTimetable,
  subscribeToFacultyTimetable,
  Timetable,
  TimetableSlot,
  FacultyScheduleEntry,
} from "../firebase/timetableService";
import { expandFaculty } from "../data/facultyLegend";
import { mergeContiguousSlots, toMinutes } from "../utils/timetable";
import LoadingSpinner from "../components/LoadingSpinner";

// One day at a time: finished classes fade, the running one is
// highlighted, and any free hour shows up as its own slot with a shortcut
// to Class Emptiness. Plain views only (no row animations), so switching
// days is instant.
//
// Saturday is excluded: every timetable in this app only runs Mon–Fri.
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Slot = TimetableSlot & { branch?: string; semester?: number; section?: string };

type Row =
  | { kind: "class"; slot: Slot; showTime: boolean; state: "past" | "now" | "upcoming" }
  | { kind: "gap"; from: number; to: number };

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// "9:00 – 11:00 AM" (one AM/PM when both ends share it) — fits one line.
function fmtRange(a: number, b: number): string {
  const sameHalf = (a < 720) === (b < 720);
  const short = (m: number) => fmt(m).replace(/ (AM|PM)$/, "");
  return sameHalf ? `${short(a)} – ${fmt(b)}` : `${fmt(a)} – ${fmt(b)}`;
}

// Monday..Friday of the current week (on a weekend: the coming week).
function weekDates(today: Date): Date[] {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const offsetToMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  return WEEKDAYS.map((_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x;
  });
}

// Classes and free gaps (>= 60 min), in time order.
function buildRows(slots: Slot[], isToday: boolean, nowMin: number): Row[] {
  const sorted = mergeContiguousSlots(slots)
    .filter((s) => toMinutes(s.startTime) >= 0)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const rows: Row[] = [];
  let lastEnd = -1;
  let lastStart = -1;
  for (const s of sorted) {
    const start = toMinutes(s.startTime);
    const end = Math.max(toMinutes(s.endTime), start + 1);
    if (lastEnd >= 0 && start - lastEnd >= 60) {
      rows.push({ kind: "gap", from: lastEnd, to: start });
    }
    const state: "past" | "now" | "upcoming" = !isToday
      ? "upcoming"
      : end <= nowMin
        ? "past"
        : start <= nowMin
          ? "now"
          : "upcoming";
    rows.push({ kind: "class", slot: s, showTime: start !== lastStart, state });
    lastStart = start;
    lastEnd = Math.max(lastEnd, end);
  }
  return rows;
}

export default function TimetableScreen() {
  const { profile, previewRole } = useAuth();
  const navigation = useNavigation<any>();
  const isFaculty = (previewRole ?? profile?.role) === "faculty";

  // --- Student path: one section's timetable doc ---
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const hasAcademicInfo = !!(profile?.branch && profile?.section && profile?.admissionYear);
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  // --- Faculty path: derived from every section's timetable (see
  // subscribeToFacultyTimetable in timetableService.ts). ---
  const [facultyEntries, setFacultyEntries] = useState<FacultyScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const todayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const [selectedDay, setSelectedDay] = useState(WEEKDAYS.includes(todayName) ? todayName : "Monday");
  const dates = useMemo(() => weekDates(now), [now.toDateString()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFaculty) {
      if (!profile?.name) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const unsubscribe = subscribeToFacultyTimetable(profile.name, (entries) => {
        setFacultyEntries(entries);
        setLoading(false);
      });
      return () => unsubscribe();
    }
    if (!profile?.branch || !profile?.section || !semester) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeToTimetable(profile.branch, semester, profile.section, (data) => {
      setTimetable(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isFaculty, profile?.name, profile?.branch, profile?.section, semester]);

  const daySlots: Slot[] = isFaculty
    ? facultyEntries.filter((e) => e.day === selectedDay)
    : timetable?.days.find((d) => d.day === selectedDay)?.slots ?? [];

  const isToday = selectedDay === todayName;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rows = useMemo(() => buildRows(daySlots, isToday, nowMin), [daySlots, isToday, nowMin]);
  const classCount = rows.filter((r) => r.kind === "class").length;

  const noProfileInfo = isFaculty ? !profile?.name : !hasAcademicInfo;
  const hasNoTimetableYet = isFaculty ? false : !timetable;

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>
            {now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </Text>
          <Text style={styles.title}>{isFaculty ? "Your teaching week" : "Your week"}</Text>
          <Text style={styles.subtitle}>
            {isFaculty
              ? "Every section you teach"
              : hasAcademicInfo
                ? `${profile?.branch} · Semester ${semester} · ${profile?.section}`
                : ""}
          </Text>
        </View>

        {noProfileInfo ? (
          <Text style={styles.emptyText}>
            {isFaculty
              ? "Your profile doesn't have a name set, so we can't match you against any timetable. Contact an admin if this looks wrong."
              : "Your branch, section, and admission year aren't set on your profile yet, so we can't show your timetable. This comes from the official student roster — contact an admin if it looks missing."}
          </Text>
        ) : (
          <>
            <View style={styles.dayRow}>
              {WEEKDAYS.map((d, i) => {
                const active = selectedDay === d;
                const isTodayPill = d === todayName;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    style={[styles.dayPill, active && styles.dayPillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={d}
                  >
                    <Text style={[styles.dayName, active && styles.dayTextActive]}>{d.slice(0, 3).toUpperCase()}</Text>
                    <Text style={[styles.dayNum, active && styles.dayTextActive]}>{dates[i].getDate()}</Text>
                    {isTodayPill && !active && <View style={styles.todayDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {loading ? (
              <LoadingSpinner style={{ marginTop: spacing.xl }} />
            ) : hasNoTimetableYet ? (
              <Text style={styles.emptyText}>No timetable has been uploaded for your section yet.</Text>
            ) : classCount === 0 ? (
              <View style={styles.emptyDay}>
                <Ionicons name="sunny-outline" size={34} color={colors.textSecondary} />
                <Text style={styles.emptyText}>
                  {isFaculty ? "No classes assigned to you on this day." : "No classes scheduled."}
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                {rows.map((row, i) => {
                  if (row.kind === "gap") {
                    return (
                      <View key={`gap-${i}`} style={styles.row}>
                        <Text style={styles.timeCol}>{fmt(row.from)}</Text>
                        <TouchableOpacity
                          style={styles.gapCard}
                          onPress={() => navigation.navigate("RoomAvailability")}
                          activeOpacity={0.75}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.gapTitle}>Free · {Math.round((row.to - row.from) / 60 * 10) / 10} hr</Text>
                            <Text style={styles.gapSub}>
                              {fmt(row.from)} – {fmt(row.to)}
                            </Text>
                          </View>
                          <Text style={styles.gapLink}>Find empty room</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  return (
                    <View key={`c-${row.slot.id}-${i}`} style={styles.row}>
                      <Text style={[styles.timeCol, row.state === "past" && { opacity: 0.5 }]}>
                        {row.showTime ? fmt(toMinutes(row.slot.startTime)) : ""}
                      </Text>
                      <ClassCard slot={row.slot} state={row.state} showSection={isFaculty} />
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

function ClassCard({ slot, state, showSection }: { slot: Slot; state: "past" | "now" | "upcoming"; showSection: boolean }) {
  // Labs (room contains "LAB") get a warm tint; lectures a cool one, so a
  // 2-hour lab reads differently from a 1-hour lecture at a glance.
  const isLab = (slot.room ?? "").toUpperCase().includes("LAB");
  const tone = isLab ? colors.tile.peach : colors.tile.blue;
  const live = state === "now";
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: live ? colors.primary : tone.bg },
        state === "past" && { opacity: 0.5 },
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.subject, { color: live ? colors.onPrimary : tone.fg }]} numberOfLines={2}>
          {slot.subjectName || slot.subjectCode}
          {slot.group ? ` · ${slot.group}` : ""}
        </Text>
        {live ? (
          <View style={[styles.tag, { backgroundColor: colors.onPrimary }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>NOW</Text>
          </View>
        ) : isLab ? (
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <Text style={[styles.tagText, { color: tone.fg }]}>LAB</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.cardMeta, { color: live ? colors.onPrimary : colors.textPrimary }]} numberOfLines={1}>
        {[slot.room, start >= 0 && end >= 0 ? fmtRange(start, end) : null].filter(Boolean).join(" · ")}
      </Text>
      <Text style={[styles.cardMeta2, { color: live ? colors.onPrimary : colors.textSecondary }]} numberOfLines={2}>
        {[
          slot.subjectCode,
          showSection && slot.branch
            ? [slot.branch, slot.semester ? `Sem ${slot.semester}` : null, slot.section].filter(Boolean).join(" ")
            : expandFaculty(slot.faculty ?? ""),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: spacing.md, marginBottom: spacing.md },
  kicker: { fontSize: 13, fontWeight: "700", color: colors.primary },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: 2 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  dayRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  dayPill: {
    flex: 1,
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dayPillActive: { backgroundColor: colors.primary },
  dayName: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4 },
  dayNum: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  dayTextActive: { color: colors.onPrimary },
  todayDot: { position: "absolute", bottom: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },

  list: { paddingBottom: 110, gap: 8 },
  row: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  timeCol: { width: 62, fontSize: 12, fontWeight: "700", color: colors.textSecondary, paddingTop: 12 },

  card: { flex: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  subject: { flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  cardMeta: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  cardMeta2: { fontSize: 12, fontWeight: "600", marginTop: 2 },

  gapCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  gapTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  gapSub: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  gapLink: { fontSize: 12, fontWeight: "800", color: colors.primary },

  emptyDay: { alignItems: "center", marginTop: spacing.xl, gap: spacing.sm },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
