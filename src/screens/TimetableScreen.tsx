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
  clayShadowSoft,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import {
  subscribeToTimetable,
  Timetable,
  TimetableSlot,
} from "../firebase/timetableService";
import { expandFaculty } from "../data/facultyLegend";

// Same reasoning as functions/src/sendClassReminderPush.ts's
// mergeContiguousSessions — a 2-hour lab is stored as two back-to-back
// 1-hour rows (e.g. 1-2 PM and 2-3 PM) so the reminder logic can treat
// each hour independently, but that means showing them as-is here would
// render two duplicate-looking cards for what a student experiences as
// one continuous class. This collapses any run of same-subject,
// same-room, contiguous slots into a single card spanning the full
// range before rendering — display-only, doesn't touch what's stored.
function mergeContiguousSlots(slots: TimetableSlot[]): TimetableSlot[] {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: TimetableSlot[] = [];

  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    const continuesLast =
      last &&
      last.endTime === slot.startTime &&
      last.subjectCode === slot.subjectCode &&
      last.room === slot.room;
    if (continuesLast) {
      last.endTime = slot.endTime; // extend, don't add a new card
    } else {
      merged.push({ ...slot });
    }
  }

  return merged;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function TimetableScreen() {
  const { profile } = useAuth();
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);

  const hasAcademicInfo = !!(
    profile?.branch &&
    profile?.section &&
    profile?.admissionYear
  );
  const semester = profile?.admissionYear
    ? getCurrentSemester(profile.admissionYear)
    : null;

  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const [selectedDay, setSelectedDay] = useState(
    WEEKDAYS.includes(todayName) ? todayName : "Monday",
  );

  useEffect(() => {
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
  }, [profile?.branch, profile?.section, semester]);

  const daySchedule = timetable?.days.find((d) => d.day === selectedDay);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>Timetable</Text>

        {!hasAcademicInfo ? (
          <Text style={styles.emptyText}>
            Your branch, section, and admission year aren't set on your profile
            yet, so we can't show your timetable. This comes from the official
            student roster — contact an admin if it looks missing.
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {profile?.branch} · Semester {semester} · {profile?.section}
            </Text>

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
            ) : !timetable ? (
              <Text style={styles.emptyText}>
                No timetable has been uploaded for your section yet.
              </Text>
            ) : (
              <FlatList
                data={mergeContiguousSlots(daySchedule?.slots ?? [])}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No classes scheduled.</Text>
                }
                renderItem={({ item }) => <ClassCard item={item} />}
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

function ClassCard({ item }: { item: TimetableSlot }) {
  return (
    <View style={styles.classCard}>
      <View style={styles.timeBlock}>
        <Text style={styles.timeText}>{to12Hour(item.startTime)}</Text>
        <Text style={styles.timeText}>{to12Hour(item.endTime)}</Text>
      </View>
      <View style={styles.classInfo}>
        <Text style={styles.subject}>
          {item.subjectCode} {item.subjectName}
          {item.group ? ` · ${item.group}` : ""}
        </Text>
        <Text style={styles.meta}>
          {expandFaculty(item.faculty)} · {item.room}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  dayTabs: { marginBottom: spacing.md, flexGrow: 0 },
  dayTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    ...clayShadowSoft,
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
    ...clayShadowSoft,
  },
  timeBlock: { width: 60, marginRight: spacing.md, justifyContent: "center" },
  timeText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  classInfo: { flex: 1, justifyContent: "center" },
  subject: { ...typography.h3, color: colors.textPrimary },
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
