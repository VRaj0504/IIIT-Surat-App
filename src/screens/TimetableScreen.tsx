import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  colors,
  spacing,
  radius,
  typography,
} from "../theme/theme";
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
import { mergeContiguousSlots } from "../utils/timetable";
import ScreenHeader from "../components/ScreenHeader";

// Same reasoning as functions/src/sendClassReminderPush.ts's
// mergeContiguousSessions — a 2-hour lab is stored as two back-to-back
// 1-hour rows (e.g. 1-2 PM and 2-3 PM) so the reminder logic can treat
// each hour independently, but that means showing them as-is here would
// render two duplicate-looking cards for what a student experiences as
// one continuous class. This collapses any run of same-subject,
// same-room, contiguous slots into a single card spanning the full
// range before rendering — display-only, doesn't touch what's stored.
//
// Accepts either a student's plain TimetableSlot[] or a faculty
// member's FacultyScheduleEntry[] (which also carries branch/section,
// since one faculty member's schedule spans multiple sections that a
// bare TimetableSlot can't distinguish between).
//
// The real bug (found via a debug log, after two earlier guesses at
// string-normalization that turned out to be solving a problem that
// never existed — every field on the "duplicate" rows was already
// byte-identical): this used to only ever compare against
// merged[merged.length - 1], the single most-recently-pushed card.
// That's fine for one linear sequence, but Group 1 and Group 2 run in
// PARALLEL, so sorted by time they interleave — CS302-Group1 (1-2pm),
// CS303-Group2 (1-2pm), CS302-Group1 (2-3pm), CS303-Group2 (2-3pm).  By
// the time CS302's second hour comes up, the "last" pushed card is
// CS303's, not CS302's own — so it never saw its own predecessor and
// always started a fresh card. Fixed by tracking the last entry PER
// (subject/room/group/section) key independently, so each group's own
// run of hours merges against itself regardless of what interleaves
// between them in sorted order.
/*function mergeContiguousSlots<T extends TimetableSlot & { branch?: string; section?: string }>(
  slots: T[],
): T[] {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: T[] = [];
  const openByKey = new Map<string, T>();

  const keyOf = (s: T) =>
    [s.subjectCode, s.room, s.group ?? "", s.branch ?? "", s.section ?? ""].join("|");

  for (const slot of sorted) {
    const key = keyOf(slot);
    const open = openByKey.get(key);
    if (open && open.endTime === slot.startTime) {
      open.endTime = slot.endTime; // extend the existing card for this track
    } else {
      const copy = { ...slot };
      merged.push(copy);
      openByKey.set(key, copy);
    }
  }

  return merged;
}
  */

// Saturday is deliberately excluded here — every seed/import path leaves
// it as an empty slots array (the source college timetables only ever
// run Mon-Fri), so showing it as a 6th pill was just permanent dead
// weight that crowded the row and pushed it into needing a scroll.
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

export default function TimetableScreen() {
  const { profile, previewRole } = useAuth();
  const isFaculty = (previewRole ?? profile?.role) === "faculty";

  // --- Student path: one section's timetable doc ---
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const hasAcademicInfo = !!(
    profile?.branch &&
    profile?.section &&
    profile?.admissionYear
  );
  const semester = profile?.admissionYear
    ? getCurrentSemester(profile.admissionYear)
    : null;

  // --- Faculty path: derived from every section's timetable — see
  // subscribeToFacultyTimetable's own comment in timetableService.ts for
  // why this is derived rather than a separate upload. ---
  const [facultyEntries, setFacultyEntries] = useState<FacultyScheduleEntry[]>([]);

  const [loading, setLoading] = useState(true);

  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const [selectedDay, setSelectedDay] = useState(
    WEEKDAYS.includes(todayName) ? todayName : "Monday",
  );

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
    const unsubscribe = subscribeToTimetable(
      profile.branch,
      semester,
      profile.section,
      (data) => {
        setTimetable(data);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [isFaculty, profile?.name, profile?.branch, profile?.section, semester]);

  const daySlots: (TimetableSlot & { branch?: string; section?: string })[] = isFaculty
    ? facultyEntries.filter((e) => e.day === selectedDay)
    : timetable?.days.find((d) => d.day === selectedDay)?.slots ?? [];

  // TEMPORARY — remove once this is confirmed fixed for real. Logs the
  // exact raw field values Firestore is returning for the selected
  // day's slots, before any merge logic runs. Brought back because the
  // last fix (keyed merge tracking) + a corrected re-imported Excel
  // together still aren't producing the right result, which means
  // there's still something about the actual current data we haven't
  // seen yet — same reasoning as the first time this log found the real
  // bug, rather than guessing at a fifth explanation blind.
  useEffect(() => {
    if (daySlots.length) {
      console.log(
        `[TimetableScreen debug] ${selectedDay} raw slots:`,
        JSON.stringify(daySlots, null, 2),
      );
    }
  }, [daySlots, selectedDay]);

  const noProfileInfo = isFaculty ? !profile?.name : !hasAcademicInfo;
  const hasNoTimetableYet = isFaculty ? false : !timetable; // faculty schedule is just "0 entries", not "not uploaded"

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader
          title="Timetable"
          subtitle={
            isFaculty
              ? "Your teaching schedule, across every section"
              : hasAcademicInfo
                ? `${profile?.branch} · Semester ${semester} · ${profile?.section}`
                : undefined
          }
        />

        {noProfileInfo ? (
          <Text style={styles.emptyText}>
            {isFaculty
              ? "Your profile doesn't have a name set, so we can't match you against any timetable. Contact an admin if this looks wrong."
              : "Your branch, section, and admission year aren't set on your profile yet, so we can't show your timetable. This comes from the official student roster — contact an admin if it looks missing."}
          </Text>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dayTabs}
              contentContainerStyle={{ gap: spacing.sm }}
            >
              {WEEKDAYS.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setSelectedDay(d)}
                  style={[
                    styles.dayTab,
                    selectedDay === d && styles.dayTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayTabText,
                      selectedDay === d && styles.dayTabTextActive,
                    ]}
                  >
                    {d.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loading ? (
              <ActivityIndicator
                style={{ marginTop: spacing.xl }}
                color={colors.primary}
              />
            ) : hasNoTimetableYet ? (
              <Text style={styles.emptyText}>
                No timetable has been uploaded for your section yet.
              </Text>
            ) : (
              <FlatList
                data={mergeContiguousSlots(daySlots)}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    {isFaculty
                      ? "No classes assigned to you on this day."
                      : "No classes scheduled."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <ClassCard item={item} showSection={isFaculty} />
                )}
              />
            )}
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// Stored as 24hr "HH:MM" (e.g. "13:00") — that's the right format for
// sorting/comparing (mergeContiguousSlots above relies on plain string
// equality/ordering), but not what anyone wants to actually read on a
// class card, so this only converts at the point of display.
function to12Hour(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function ClassCard({
  item,
  showSection,
}: {
  item: TimetableSlot & { branch?: string; semester?: number; section?: string };
  showSection: boolean;
}) {
  // Room strings for labs always contain "LAB" (e.g. "CSE LAB 1", "PHY LAB
  // 2" — see scripts/seed-timetable.mjs and timetableImport.ts). Using
  // that to color-code and tag lab sessions differently from lectures is
  // both more scannable (labs run longer and need specific kit/seating)
  // and breaks up what was otherwise a stack of visually identical white
  // rows with no way to tell a 3-hour lab from a 1-hour lecture at a glance.
  const isLab = item.room.toUpperCase().includes("LAB");
  const accent = isLab ? colors.badge.peach : colors.badge.blue;

  return (
    <View style={[styles.classCard, { borderLeftColor: accent.fg }]}>
      <View style={styles.timeBlock}>
        <Text style={styles.timeText}>{to12Hour(item.startTime)}</Text>
        <Text style={styles.timeText}>{to12Hour(item.endTime)}</Text>
      </View>
      <View style={styles.classInfo}>
        <View style={styles.subjectRow}>
          <Text style={styles.subject}>
            {item.subjectCode} {item.subjectName}
            {item.group ? ` · ${item.group}` : ""}
          </Text>
          {isLab && (
            <View style={[styles.labTag, { backgroundColor: accent.bg }]}>
              <Text style={[styles.labTagText, { color: accent.fg }]}>LAB</Text>
            </View>
          )}
        </View>
        {/* Faculty view only — a student always knows their own section,
            but a faculty member teaches several, so each card needs to
            say which one this particular class belongs to. */}
        {showSection && item.branch && (
          <Text style={styles.sectionTag}>
            {item.branch} · Sem {item.semester} · {item.section}
          </Text>
        )}
        <Text style={styles.meta}>
          {expandFaculty(item.faculty)} · {item.room}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  dayTabs: { marginBottom: spacing.md, flexGrow: 0 },
  dayTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 56,
    alignItems: "center",
  },
  dayTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayTabText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  dayTabTextActive: { color: "#fff" },
  list: { paddingBottom: spacing.xl },
  classCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  timeBlock: { width: 60, marginRight: spacing.md, justifyContent: "center" },
  timeText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  classInfo: { flex: 1, justifyContent: "center" },
  subjectRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  labTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm },
  labTagText: { fontSize: 10, fontWeight: "700" },
  subject: { ...typography.h3, color: colors.textPrimary },
  sectionTag: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
