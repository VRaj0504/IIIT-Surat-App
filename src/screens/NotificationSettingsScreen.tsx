import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  getNotificationPreferences,
  updateNotificationPreference,
  NotificationPreferences,
} from "../firebase/notificationPreferences";

type Row = {
  key: Exclude<keyof NotificationPreferences, "classReminderMinutes">;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

const ROWS: Row[] = [
  {
    key: "classReminders",
    icon: "time-outline",
    title: "Class Reminders",
    description: "A push before each class starts, with the subject and room number",
  },
  {
    key: "notices",
    icon: "megaphone-outline",
    title: "Notices",
    description: "Official notices targeted to your branch, section, or year",
  },
  {
    key: "resources",
    icon: "folder-open-outline",
    title: "New Resources",
    description: "When notes, PYQs, or slides are added for your branch and semester",
  },
  {
    key: "announcements",
    icon: "chatbox-ellipses-outline",
    title: "Announcements",
    description: "Announcements posted by faculty for your class",
  },
  {
    key: "timetableUpdates",
    icon: "calendar-outline",
    title: "Timetable Updates",
    description: "When your section's timetable is created or corrected",
  },

  {
  key: "examsAndGrades",
  icon: "reader-outline",
  title: "Exams & Grades",
  description: "When an exam date sheet is published for your semester, or a grade is posted",
},

  {
    key: "clubEvents",
    icon: "flag-outline",
    title: "Club Events",
    description: "New events posted by any club",
  },
];

// Same fixed preset as functions/src/sendClassReminderPush.ts's
// REMINDER_OFFSETS — the server only ever checks these exact values, so
// offering anything else here would silently never fire.
const REMINDER_MINUTES_OPTIONS = [3, 5, 7, 10, 15] as const;

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    getNotificationPreferences(user.uid).then(setPrefs);
  }, [user?.uid]);

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!user?.uid || !prefs) return;
    // Update the screen immediately, then save — a toggle should feel
    // instant, not wait on a round trip before visibly moving.
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    try {
      await updateNotificationPreference(user.uid, key, value);
    } catch (err) {
      // Revert on failure so the switch doesn't lie about what's saved.
      setPrefs((current) => (current ? { ...current, [key]: !value } : current));
    } finally {
      setSavingKey(null);
    }
  };

  const handleMinutesChange = async (minutes: number) => {
    if (!user?.uid || !prefs) return;
    setPrefs({ ...prefs, classReminderMinutes: minutes });
    setSavingKey("classReminderMinutes");
    try {
      await updateNotificationPreference(user.uid, "classReminderMinutes", minutes);
    } catch (err) {
      setPrefs((current) => (current ? { ...current, classReminderMinutes: prefs.classReminderMinutes } : current));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.intro}>
            Choose which push notifications you get from IIIT Surat App. Turning something off only
            stops the push — it still shows up in the app itself.
          </Text>

          {!prefs ? (
            <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
          ) : (
            ROWS.map((row) => (
              <React.Fragment key={row.key}>
                <View style={[styles.row, clayShadowSoft]}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={row.icon} size={22} color={colors.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowDescription}>{row.description}</Text>
                  </View>
                  {savingKey === row.key ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Switch
                      value={prefs[row.key]}
                      onValueChange={(value) => handleToggle(row.key, value)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  )}
                </View>
                {row.key === "classReminders" && prefs.classReminders && (
                  <View style={styles.minutesRow}>
                    <Text style={styles.minutesLabel}>Remind me</Text>
                    <View style={styles.minutesChips}>
                      {REMINDER_MINUTES_OPTIONS.map((minutes) => {
                        const selected = prefs.classReminderMinutes === minutes;
                        return (
                          <TouchableOpacity
                            key={minutes}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => handleMinutesChange(minutes)}
                            disabled={savingKey === "classReminderMinutes"}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                              {minutes} min
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </React.Fragment>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  intro: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: "#EAF0FB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 2 },
  rowDescription: { ...typography.caption, color: colors.textSecondary },
  minutesRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: -spacing.sm + 2,
    marginBottom: spacing.md,
  },
  minutesLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  minutesChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: "#EAF0FB",
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
});
