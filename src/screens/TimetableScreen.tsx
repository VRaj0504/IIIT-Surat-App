import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { SheetPicker } from "../components/ui";
import { getDayStatus } from "../utils/dayStatus";
import { subscribeToHolidayOverrides } from "../firebase/holidayOverridesService";
import { subscribeToExamSchedules, ExamSchedule } from "../firebase/examScheduleService";
import { subscribeToAllTimetables } from "../firebase/timetableService";
import { getRoomAvailability } from "../utils/roomAvailability";
import {
  ClassChange,
  findClassChange,
  isoDate,
  removeClassChange,
  saveClassChange,
  subscribeToClassChanges,
} from "../firebase/classChangesService";
import DesktopWeek from "../components/web/DesktopWeek";
import { useWebLayout } from "../utils/useWebLayout";

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

function fmtRange(a: number, b: number): string {
  const sameHalf = (a < 720) === (b < 720);
  const short = (m: number) => fmt(m).replace(/ (AM|PM)$/, "");
  return sameHalf ? `${short(a)} – ${fmt(b)}` : `${fmt(a)} – ${fmt(b)}`;
}

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function weekDates(today: Date): Date[] {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  return WEEKDAYS.map((_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x;
  });
}

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
  const { profile, previewRole, user } = useAuth();
  const { isDesktop } = useWebLayout();
  const navigation = useNavigation<any>();
  const isFaculty = (previewRole ?? profile?.role) === "faculty";

  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const hasAcademicInfo = !!(profile?.branch && profile?.section && profile?.admissionYear);
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

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

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => subscribeToHolidayOverrides(setOverrides), []);

  const [exams, setExams] = useState<ExamSchedule[]>([]);
  useEffect(() => {
    if (isFaculty || !profile?.branch || !semester) return;
    return subscribeToExamSchedules(profile.branch, semester, profile.enrollmentNumber, setExams);
  }, [isFaculty, profile?.branch, semester, profile?.enrollmentNumber]);

  const [changes, setChanges] = useState<ClassChange[]>([]);
  useEffect(() => {
    if (isFaculty) {
      if (!user?.uid) return;
      return subscribeToClassChanges({ createdBy: user.uid }, setChanges);
    }
    if (!semester) return;
    return subscribeToClassChanges({ semester }, setChanges);
  }, [isFaculty, user?.uid, semester]);

  const isWeekendNow = now.getDay() === 0 || now.getDay() === 6;
  const statusFor = (i: number) =>
    getDayStatus(new Date(dates[i].getFullYear(), dates[i].getMonth(), dates[i].getDate(), 12), isFaculty ? [] : exams, overrides);
  const selectedIndex = Math.max(0, WEEKDAYS.indexOf(selectedDay));
  const selectedDate = dates[selectedIndex];
  const selectedIso = isoDate(selectedDate);
  const dayStatus = statusFor(selectedIndex);

  const changeFor = (slot: Slot) =>
    findClassChange(changes, slot, selectedIso, isFaculty ? { branch: slot.branch, section: slot.section } : { branch: profile?.branch, section: profile?.section });

  const [action, setAction] = useState<Slot | null>(null);
  const [roomPicker, setRoomPicker] = useState<{ slot: Slot; rooms: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const actionChange = action ? changeFor(action) : null;

  const writeChange = async (slot: Slot, type: "cancelled" | "room", newRoom: string | null) => {
    if (!user?.uid || !slot.branch || !slot.semester) return;
    setBusy(true);
    try {
      await saveClassChange({
        date: selectedIso,
        branch: slot.branch,
        semester: slot.semester,
        section: slot.section ?? null,
        subjectCode: slot.subjectCode,
        subjectName: slot.subjectName || slot.subjectCode,
        startTime: slot.startTime,
        endTime: slot.endTime,
        type,
        oldRoom: slot.room ?? null,
        newRoom,
        facultyName: profile?.name ?? "",
        createdBy: user.uid,
      });
      setAction(null);
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const openRoomPicker = (slot: Slot) => {
    setBusy(true);
    const unsub = subscribeToAllTimetables(
      (tts) => {
        unsub();
        const rooms = getRoomAvailability(tts, selectedDay, slot.startTime)
          .filter((r) => !r.occupant)
          .map((r) => r.room)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setBusy(false);
        setAction(null);
        setRoomPicker({ slot, rooms });
      },
      () => {
        unsub();
        setBusy(false);
        Alert.alert("Couldn't load rooms", "Please try again.");
      },
    );
  };

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
        ) : isDesktop ? (
          loading ? (
            <LoadingSpinner style={{ marginTop: spacing.xl }} />
          ) : hasNoTimetableYet ? (
            <Text style={styles.emptyText}>No timetable has been uploaded for your section yet.</Text>
          ) : (
            <DesktopWeek
              isFaculty={isFaculty}
              todayName={todayName}
              nowMin={nowMin}
              changeFor={(slot, date) =>
                findClassChange(changes, slot, isoDate(date), isFaculty ? { branch: slot.branch, section: slot.section } : { branch: profile?.branch, section: profile?.section })
              }
              days={WEEKDAYS.map((d, i) => ({
                day: d,
                date: dates[i],
                slots: isFaculty ? facultyEntries.filter((e) => e.day === d) : timetable?.days.find((x) => x.day === d)?.slots ?? [],
              }))}
            />
          )
        ) : (
          <>
            <View style={styles.dayRow}>
              {WEEKDAYS.map((d, i) => {
                const active = selectedDay === d;
                const isTodayPill = d === todayName;
                const off = !!statusFor(i);
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
                    <Text style={[styles.dayNum, active && styles.dayTextActive, off && !active && { opacity: 0.45 }]}>{dates[i].getDate()}</Text>
                    {off ? (
                      <Text style={[styles.offMark, active && styles.dayTextActive]}>OFF</Text>
                    ) : (
                      isTodayPill && !active && <View style={styles.todayDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {isWeekendNow && <Text style={styles.weekNote}>Showing next week</Text>}

            {loading ? (
              <LoadingSpinner style={{ marginTop: spacing.xl }} />
            ) : hasNoTimetableYet ? (
              <Text style={styles.emptyText}>No timetable has been uploaded for your section yet.</Text>
            ) : dayStatus ? (
              <View style={styles.offCard}>
                <Ionicons name="sunny-outline" size={30} color={colors.tile.peach.fg} />
                <Text style={styles.offTitle}>{dayStatus.label}</Text>
                <Text style={styles.offSub}>No classes on this day.</Text>
              </View>
            ) : classCount === 0 ? (
              <View style={styles.emptyDay}>
                <Ionicons name="sunny-outline" size={34} color={colors.textSecondary} />
                <Text style={styles.emptyText}>
                  {isFaculty ? "No classes assigned to you on this day." : "No classes scheduled."}
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                {isFaculty && <Text style={styles.facultyHint}>Tap a class to cancel it or change its room for this day.</Text>}
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
                            <Text style={styles.gapTitle}>Free · {fmtDur(row.to - row.from)}</Text>
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
                      <Text style={[styles.timeCol, row.state === "past" && { opacity: 0.72 }]}>
                        {row.showTime ? fmt(toMinutes(row.slot.startTime)) : ""}
                      </Text>
                      <ClassCard
                        slot={row.slot}
                        state={row.state}
                        showSection={isFaculty}
                        nowMin={nowMin}
                        change={changeFor(row.slot)}
                        onPress={isFaculty && row.state !== "past" ? () => setAction(row.slot) : undefined}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </SafeAreaView>

      <Modal visible={!!action} transparent animationType="slide" onRequestClose={() => setAction(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !busy && setAction(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {action && (
              <>
                <Text style={styles.sheetTitle}>{action.subjectName || action.subjectCode}</Text>
                <Text style={styles.sheetSub}>
                  {selectedDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} ·{" "}
                  {fmtRange(toMinutes(action.startTime), toMinutes(action.endTime))} ·{" "}
                  {[action.branch, action.semester ? `Sem ${action.semester}` : null, action.section].filter(Boolean).join(" ")}
                </Text>
                {busy ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
                ) : (
                  <>
                    {actionChange?.type !== "cancelled" && (
                      <TouchableOpacity
                        style={[styles.sheetBtn, { backgroundColor: colors.danger + "18" }]}
                        onPress={() =>
                          Alert.alert("Cancel this class?", "Students in this section get a notification right away.", [
                            { text: "Keep it", style: "cancel" },
                            { text: "Cancel class", style: "destructive", onPress: () => writeChange(action, "cancelled", null) },
                          ])
                        }
                      >
                        <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                        <Text style={[styles.sheetBtnText, { color: colors.danger }]}>Cancel this class</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.sheetBtn} onPress={() => openRoomPicker(action)}>
                      <Ionicons name="business-outline" size={20} color={colors.primary} />
                      <Text style={styles.sheetBtnText}>
                        {actionChange?.type === "room" ? `Change room again (now ${actionChange.newRoom})` : "Change room for this day"}
                      </Text>
                    </TouchableOpacity>
                    {actionChange && (
                      <TouchableOpacity
                        style={styles.sheetBtn}
                        onPress={async () => {
                          setBusy(true);
                          try {
                            await removeClassChange(actionChange.id, actionChange);
                            setAction(null);
                          } catch (err: any) {
                            Alert.alert("Couldn't undo", err?.message ?? "Please try again.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Ionicons name="arrow-undo-outline" size={20} color={colors.textPrimary} />
                        <Text style={[styles.sheetBtnText, { color: colors.textPrimary }]}>
                          Undo {actionChange.type === "cancelled" ? "cancellation" : "room change"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.sheetClose} onPress={() => setAction(null)}>
                      <Text style={styles.sheetCloseText}>Close</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <SheetPicker
        visible={!!roomPicker}
        title="Free rooms at this time"
        items={roomPicker?.rooms ?? []}
        keyOf={(r) => r}
        labelOf={(r) => r}
        selectedKey={null}
        onPick={(r) => roomPicker && writeChange(roomPicker.slot, "room", r)}
        onClose={() => setRoomPicker(null)}
        searchable
        emptyText="No free rooms found at this time."
      />
    </View>
  );
}

function ClassCard({
  slot,
  state,
  showSection,
  nowMin,
  change,
  onPress,
}: {
  slot: Slot;
  state: "past" | "now" | "upcoming";
  showSection: boolean;
  nowMin: number;
  change: ClassChange | null;
  onPress?: () => void;
}) {
  const isLab = (slot.room ?? "").toUpperCase().includes("LAB");
  const cancelled = change?.type === "cancelled";
  const moved = change?.type === "room";
  const tone = cancelled ? { bg: colors.surfaceAlt, fg: colors.textSecondary } : isLab ? colors.tile.peach : colors.tile.blue;
  const live = state === "now" && !cancelled;
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  const progress = live && end > start ? Math.min(1, Math.max(0, (nowMin - start) / (end - start))) : 0;
  const room = moved ? change?.newRoom : slot.room;
  const tag = cancelled ? "CANCELLED" : moved ? "ROOM CHANGED" : live ? "NOW" : isLab ? "LAB" : null;
  const Wrap: any = onPress ? TouchableOpacity : View;

  return (
    <Wrap
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.card,
        { backgroundColor: live ? colors.primary : tone.bg },
        state === "past" && { opacity: 0.72 },
      ]}
    >
      <View style={styles.cardTop}>
        <Text
          style={[styles.subject, { color: live ? colors.onPrimary : tone.fg }, cancelled && styles.strike]}
          numberOfLines={2}
        >
          {slot.subjectName || slot.subjectCode}
          {slot.group ? ` · ${slot.group}` : ""}
        </Text>
        {tag && (
          <View
            style={[
              styles.tag,
              {
                backgroundColor: live ? colors.onPrimary : cancelled ? colors.danger : moved ? colors.warning : colors.surface,
              },
            ]}
          >
            <Text style={[styles.tagText, { color: live ? colors.primary : cancelled || moved ? "#FFFFFF" : tone.fg }]}>{tag}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cardMeta, { color: live ? colors.onPrimary : colors.textPrimary }]} numberOfLines={1}>
        {cancelled
          ? `No class · ${start >= 0 && end >= 0 ? fmtRange(start, end) : ""}`
          : [moved && slot.room ? `${room} (was ${slot.room})` : room, start >= 0 && end >= 0 ? fmtRange(start, end) : null]
              .filter(Boolean)
              .join(" · ")}
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
      {live && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
    </Wrap>
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
  offMark: { fontSize: 9, fontWeight: "900", color: colors.danger, letterSpacing: 0.6 },
  weekNote: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.sm },
  offCard: { alignItems: "center", gap: 6, backgroundColor: colors.tile.peach.bg, borderRadius: 20, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  offTitle: { fontSize: 18, fontWeight: "800", color: colors.tile.peach.fg, textAlign: "center" },
  offSub: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  strike: { textDecorationLine: "line-through" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", marginTop: 10, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.onPrimary },
  facultyHint: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 2 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  sheetSub: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.sm },
  sheetBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, paddingHorizontal: spacing.md },
  sheetBtnText: { fontSize: 15, fontWeight: "700", color: colors.primary, flex: 1 },
  sheetClose: { alignItems: "center", paddingVertical: spacing.sm },
  sheetCloseText: { fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
