import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { subscribeToAllTimetables, Timetable } from "../firebase/timetableService";
import { getRoomAvailability, getAllTimeSlots, pickCurrentSlot, RoomStatus } from "../utils/roomAvailability";
import LoadingSpinner from "../components/LoadingSpinner";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function currentWeekdayOrFirst(): string {
  const jsDay = new Date().getDay();
  const idx = jsDay - 1;
  return idx >= 0 && idx <= 4 ? WEEKDAYS[idx] : WEEKDAYS[0];
}

function isWeekend(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

function formatSlotLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function RoomAvailabilityScreen() {
  const [timetables, setTimetables] = useState<Timetable[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState(currentWeekdayOrFirst());
  const [time, setTime] = useState<string | null>(null);
  const [phase, setPhase] = useState<"before" | "during" | "between" | "after">("during");

  const today = isWeekend() ? null : currentWeekdayOrFirst();

  useEffect(() => {
    const unsubscribe = subscribeToAllTimetables(
      (tts) => {
        setLoadError(null);
        setTimetables(tts);
      },
      (err) => {

        setLoadError(err.message || "Couldn't load timetables.");
        setTimetables((prev) => prev ?? []);
      },
    );
    return () => unsubscribe();
  }, []);

  const timeSlots = useMemo(() => (timetables ? getAllTimeSlots(timetables) : []), [timetables]);

  useEffect(() => {
    if (timeSlots.length === 0) return;

    if (time !== null && timeSlots.includes(time)) return;
    if (today === null) {

      setTime(timeSlots[0]);
      setPhase("before");
      return;
    }
    const now = new Date();
    const pick = pickCurrentSlot(timeSlots, now.getHours() * 60 + now.getMinutes());
    setTime(pick.slot);
    setPhase(pick.phase);
  }, [timeSlots, time, today]);

  const [autoTime, setAutoTime] = useState(true);
  const showPhaseNote = autoTime && today !== null && day === today;

  const statuses: RoomStatus[] = useMemo(() => {
    if (!timetables || !time) return [];
    return getRoomAvailability(timetables, day, time);
  }, [timetables, day, time]);

  const free = statuses.filter((s) => !s.occupant);
  const occupied = statuses.filter((s) => s.occupant);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>Empty Classes</Text>
        {today === null && day === WEEKDAYS[0] ? (
          <Text style={styles.emptyNote}>It's the weekend — showing Monday's timetable.</Text>
        ) : !showPhaseNote ? null : phase === "after" ? (
          <Text style={styles.emptyNote}>Today's classes are over — showing the last period of the day.</Text>
        ) : phase === "between" ? (
          <Text style={styles.emptyNote}>Between periods — showing the next one.</Text>
        ) : phase === "before" ? (
          <Text style={styles.emptyNote}>Classes haven't started yet — showing the first period.</Text>
        ) : null}

        <Text style={styles.pillLabel}>Day</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillRow}
          contentContainerStyle={styles.pillRowContent}
        >
          {WEEKDAYS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.pill, day === d && styles.pillActive]}
              onPress={() => setDay(d)}
            >
              <Text style={[styles.pillText, day === d && styles.pillTextActive]}>{d.slice(0, 3)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {timeSlots.length > 0 && (
          <>
            <Text style={styles.pillLabel}>Time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillRow}
              contentContainerStyle={styles.pillRowContent}
            >
              {timeSlots.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pill, time === t && styles.pillActive]}
                  onPress={() => {
                    setTime(t);
                    setAutoTime(false);
                  }}
                >
                  <Text style={[styles.pillText, time === t && styles.pillTextActive]}>{formatSlotLabel(t)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {!timetables ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : loadError && timetables.length === 0 ? (
          <Text style={styles.emptyText}>Couldn't load timetables — check your connection and reopen this screen.</Text>
        ) : statuses.length === 0 ? (
          <Text style={styles.emptyText}>No timetable data uploaded yet — nothing to check against.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionTitle}>
              Empty on {day} at {time ? formatSlotLabel(time) : ""} ({free.length})
            </Text>
            <View style={styles.roomGrid}>
              {free.map((s) => (
                <View key={s.room} style={[styles.roomChip, styles.roomChipFree]}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.roomChipFreeText} numberOfLines={1} ellipsizeMode="tail">
                    {s.room}
                  </Text>
                </View>
              ))}
              {free.length === 0 && <Text style={styles.emptyNote}>Every known room is in use at this day/time.</Text>}
            </View>

            <Text style={styles.sectionTitle}>In use ({occupied.length})</Text>
            {occupied.map((s) => (
              <View key={s.room} style={styles.occupiedCard}>
                <Text style={styles.occupiedRoom}>{s.room}</Text>
                <Text style={styles.occupiedDetail}>
                  {s.occupant!.subjectName} · {s.occupant!.branch} Sem {s.occupant!.semester} {s.occupant!.section}
                </Text>
                <Text style={styles.occupiedMeta}>
                  {s.occupant!.faculty} · {formatSlotLabel(s.occupant!.startTime)}–{formatSlotLabel(s.occupant!.endTime)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  pillLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: 4,
  },

  pillRow: { flexGrow: 0, height: 46, marginBottom: spacing.md },
  pillRowContent: { gap: spacing.xs, alignItems: "center", paddingRight: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.textPrimary },
  pillTextActive: { color: colors.surface },
  scrollContent: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  roomGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roomChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    maxWidth: "100%",
  },
  roomChipFree: {
    backgroundColor: colors.successBg,
    borderWidth: 1.5,
    borderColor: colors.successBorder,
  },
  roomChipFreeText: { color: colors.successFg, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  occupiedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  occupiedRoom: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  occupiedDetail: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  occupiedMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  emptyText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xl, textAlign: "center" },
  emptyNote: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic" },
});
