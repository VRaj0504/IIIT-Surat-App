import React, { useState } from "react";
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
import { academicCalendars } from "../data/academicCalendar";

function shortTitle(t: string): string {
  if (/odd semester/i.test(t)) return "3rd, 5th & 7th sem";
  if (/1st semester/i.test(t)) return "1st sem";
  if (/restricted/i.test(t)) return "Restricted holidays";
  if (/public holidays/i.test(t)) return "Holidays";
  return t;
}

export default function AcademicCalendarScreen() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const calendar = academicCalendars[selectedIndex];

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

        <ScrollView contentContainerStyle={styles.list}>
          {calendar.events.map((event, index) => (
            <View key={index} style={styles.eventCard}>
              <Text style={styles.activity}>{event.activity}</Text>
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
