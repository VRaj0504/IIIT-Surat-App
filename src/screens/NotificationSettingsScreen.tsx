import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView } from "react-native";
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
  key: keyof NotificationPreferences;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

const ROWS: Row[] = [
  {
    key: "classReminders",
    icon: "time-outline",
    title: "Class Reminders",
    description: "A push 3 minutes before each class, with the subject and room number",
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
    key: "clubEvents",
    icon: "flag-outline",
    title: "Club Events",
    description: "New events posted by any club",
  },
];

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
              <View key={row.key} style={[styles.row, clayShadowSoft]}>
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
});
