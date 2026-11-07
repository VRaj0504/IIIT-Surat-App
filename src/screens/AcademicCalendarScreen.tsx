import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import Ionicons from "@expo/vector-icons/Ionicons";
import { academicCalendars, type CalendarEvent } from "../data/academicCalendar";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Reads "21st Sept (Mon) – 28th Sept (Mon), 2026" into a start and end date. */
function parseRange(text: string): { start: Date; end: Date } | null {
  const dates: { d: number; m: number; at: number }[] = [];
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) dates.push({ d: Number(m[1]), m: mi, at: m.index });
  }
  if (!dates.length) return null;
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((y) => ({ y: Number(y[1]), at: y.index ?? 0 }));
  const yearAfter = (at: number) => (years.find((y) => y.at > at) ?? years[years.length - 1])?.y ?? new Date().getFullYear();
  const toDate = (x: (typeof dates)[number]) => new Date(yearAfter(x.at), x.m, x.d);
  return { start: toDate(dates[0]), end: toDate(dates[dates.length - 1]) };
}

type Kind = "exam" | "break" | "other";
function kindOf(e: CalendarEvent): Kind {
  if (/exam|test/i.test(e.activity)) return "exam";
  if (/break|vacation|holiday|diwali/i.test(e.activity)) return "break";
  return "other";
}

function dayDiff(a: Date, b: Date) {
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000);
}

function shortTitle(t: string): string {
  if (/odd semester/i.test(t)) return "3rd, 5th & 7th sem";
  if (/1st semester/i.test(t)) return "1st sem";
  if (/restricted/i.test(t)) return "Restricted holidays";
  if (/public holidays/i.test(t)) return "Holidays";
  return t;
}

export default function AcademicCalendarScreen() {
  const { profile } = useAuth();
  const firstSem = profile?.role === "student" && profile.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) === 1 : false;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (!firstSem) return 0;
    const i = academicCalendars.findIndex((c) => /1st semester/i.test(c.title));
    return i >= 0 ? i : 0;
  });
  const calendar = academicCalendars[selectedIndex];
  const listRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<number, number>>({});
  const scrolledFor = useRef<number | null>(null);

  const rows = useMemo(() => {
    const today = new Date();
    let nextMarked = false;
    return calendar.events.map((event) => {
      const r = parseRange(event.duration);
      let status: "past" | "now" | "next" | "later" = "later";
      let note = "";
      if (r) {
        if (dayDiff(r.end, today) < 0) status = "past";
        else if (dayDiff(r.start, today) <= 0) {
          status = "now";
          note = /till/i.test(event.duration) ? "Ongoing" : "Happening now";
        } else if (!nextMarked) {
          status = "next";
          const n = dayDiff(r.start, today);
          note = n === 1 ? "Tomorrow" : `In ${n} days`;
        }
        if (status === "next") nextMarked = true;
      }
      return { event, status, note, kind: kindOf(event) };
    });
  }, [calendar]);
  const focusIndex = rows.findIndex((r) => r.status === "now" || r.status === "next");

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.subtitle}>2026-27</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.tabs}>
          {academicCalendars.map((cal, index) => (
            <TouchableOpacity
              key={cal.title}
              style={[styles.tab, selectedIndex === index && styles.tabActive]}
              onPress={() => setSelectedIndex(index)}
            >
              <Text
                style={[
                  styles.tabText,
                  selectedIndex === index && styles.tabTextActive,
                ]}
              >
                {shortTitle(cal.title)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.calTitle}>{calendar.title}</Text>

        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>Exams</Text>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>Breaks</Text>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Now / next</Text>
        </View>

        <ScrollView ref={listRef} contentContainerStyle={styles.list}>
          {rows.map(({ event, status, note, kind }, index) => (
            <View
              key={index}
              onLayout={(e) => {
                rowY.current[index] = e.nativeEvent.layout.y;
                if (index === focusIndex && scrolledFor.current !== selectedIndex && focusIndex > 1) {
                  scrolledFor.current = selectedIndex;
                  requestAnimationFrame(() => listRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 80), animated: false }));
                }
              }}
              style={[
                styles.eventCard,
                kind === "exam" && styles.cardExam,
                kind === "break" && styles.cardBreak,
                (status === "now" || status === "next") && styles.cardFocus,
                status === "past" && styles.cardPast,
              ]}
            >
              {!!note && (
                <View style={styles.noteRow}>
                  <Ionicons name={status === "now" ? "radio-button-on" : "arrow-forward-circle"} size={13} color={colors.primary} />
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              )}
              <Text style={[styles.activity, status === "past" && styles.pastText]}>{event.activity}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.duration}>{event.duration}</Text>
                {event.week !== "-" && (
                  <Text style={styles.week}>Week {event.week}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  calTitle: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "700",
    textAlign: "center",
  },
  tabTextActive: { color: colors.onPrimary },
  list: { paddingBottom: spacing.xl },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },
  legendText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: "600", marginRight: 6 },
  cardExam: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  cardBreak: { borderLeftWidth: 4, borderLeftColor: colors.success },
  cardFocus: { borderWidth: 1.5, borderColor: colors.primary },
  cardPast: { opacity: 0.55 },
  pastText: { textDecorationLine: "none" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  noteText: { fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  activity: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  duration: { ...typography.caption, color: colors.textSecondary },
  week: { ...typography.caption, color: colors.primary, fontWeight: "700" },
});
