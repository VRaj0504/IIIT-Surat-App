import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  subscribeToAnnouncements,
  deleteAnnouncement,
  postAnnouncement,
  getAdmissionYears,
  getClassOptionsForYear,
  yearOfStudyLabel,
  ClassOption,
  Announcement,
} from "../firebase/announcementsService";

function timeAgo(ts: Announcement["createdAt"]): string {
  if (!ts) return "";
  const diff = Date.now() - ts.toMillis();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AnnouncementsScreen() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const isFaculty = profile?.role === "faculty";

  // --- Feed (both roles) ---
  useEffect(() => {
    const viewer = isFaculty
      ? null
      : {
          branch: profile?.branch,
          section: profile?.section,
          admissionYear: profile?.admissionYear,
          specialization: profile?.specialization,
        };
    const unsubscribe = subscribeToAnnouncements((items) => {
      setAnnouncements(items);
      setLoading(false);
    }, viewer);
    return () => unsubscribe();
  }, [isFaculty, profile?.branch, profile?.section, profile?.admissionYear, profile?.specialization]);

  const handleDelete = (item: Announcement) => {
    Alert.alert("Delete announcement?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAnnouncement(item.id);
          } catch (err: any) {
            Alert.alert("Couldn't delete", err.message ?? "Please try again.");
          }
        },
      },
    ]);
  };

  const targetLabel = (a: Announcement) =>
    [a.targetBranch, a.targetSection, a.targetSpecialization, a.targetAdmissionYear].filter(Boolean).join(" · ");

  // --- Compose form (faculty only — was PostAnnouncementScreen, merged in
  // here so there's one screen instead of two near-identically-named ones
  // cluttering Home). ---
  const [years, setYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!isFaculty) return;
    getAdmissionYears()
      .then(setYears)
      .catch(() => setYears([]))
      .finally(() => setYearsLoading(false));
  }, [isFaculty]);

  useEffect(() => {
    if (selectedYear === null) {
      setClassOptions([]);
      setSelectedClass(null);
      return;
    }
    setClassesLoading(true);
    setSelectedClass(null);
    getClassOptionsForYear(selectedYear)
      .then(setClassOptions)
      .catch(() => setClassOptions([]))
      .finally(() => setClassesLoading(false));
  }, [selectedYear]);

  const handlePost = async () => {
    if (!profile) return;
    if (selectedYear === null || !selectedClass) {
      Alert.alert("Pick a class", "Choose the year and class this is for.");
      return;
    }
    if (selectedClass.specializations.length > 0 && !selectedSpecialization) {
      Alert.alert("Pick a specialization", "This class has multiple specializations — choose one, or 'All' for everyone in it.");
      return;
    }
    if (!message.trim()) {
      Alert.alert("Empty message", "Type what you want to announce.");
      return;
    }
    setPosting(true);
    try {
      await postAnnouncement({
        message,
        targetBranch: selectedClass.branch,
        targetSection: selectedClass.section,
        targetAdmissionYear: selectedYear,
        targetSpecialization: selectedSpecialization === "__ALL__" ? null : selectedSpecialization,
        createdBy: profile.uid,
        createdByName: profile.name,
      });
      // Reset the form in place rather than navigating away — the new
      // announcement shows up in the list right below automatically via
      // the live subscription above.
      setMessage("");
      setSelectedYear(null);
      setSelectedClass(null);
      setSelectedSpecialization(null);
    } catch (err: any) {
      Alert.alert("Couldn't post", err.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const ComposeForm = isFaculty ? (
    <View style={styles.composeCard}>
      <Text style={styles.composeHeader}>New Announcement</Text>
      <Text style={styles.helper}>
        Goes only to the class you pick — not everyone. For a cancelled class, a room change, etc.
      </Text>

      <Text style={styles.label}>Year (batch)</Text>
      {yearsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
      ) : years.length === 0 ? (
        <Text style={styles.emptyNote}>No batches found in the roster yet.</Text>
      ) : (
        <View style={styles.chipRow}>
          {years.map((y) => (
            <TouchableOpacity
              key={y}
              style={[styles.chip, selectedYear === y && styles.chipActive]}
              onPress={() => setSelectedYear(y)}
            >
              <Text style={[styles.chipText, selectedYear === y && styles.chipTextActive]}>{yearOfStudyLabel(y)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {selectedYear !== null && (
        <>
          <Text style={styles.label}>Class</Text>
          {classesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
          ) : classOptions.length === 0 ? (
            <Text style={styles.emptyNote}>No classes found for that batch.</Text>
          ) : (
            <View style={styles.chipRow}>
              {classOptions.map((c) => {
                const key = `${c.branch}||${c.section ?? ""}`;
                const active = selectedClass?.branch === c.branch && selectedClass?.section === c.section;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setSelectedClass(c);
                      setSelectedSpecialization(null);
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}

      {selectedClass && selectedClass.specializations.length > 0 && (
        <>
          <Text style={styles.label}>Specialization ({selectedClass.label} has more than one)</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, selectedSpecialization === "__ALL__" && styles.chipActive]}
              onPress={() => setSelectedSpecialization("__ALL__")}
            >
              <Text style={[styles.chipText, selectedSpecialization === "__ALL__" && styles.chipTextActive]}>
                All of {selectedClass.label}
              </Text>
            </TouchableOpacity>
            {selectedClass.specializations.map((spec) => (
              <TouchableOpacity
                key={spec}
                style={[styles.chip, selectedSpecialization === spec && styles.chipActive]}
                onPress={() => setSelectedSpecialization(spec)}
              >
                <Text style={[styles.chipText, selectedSpecialization === spec && styles.chipTextActive]}>{spec}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Message</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="e.g. Today's 2 PM DBMS lecture is cancelled."
        placeholderTextColor={colors.textSecondary}
        value={message}
        onChangeText={setMessage}
        multiline
      />

      <TouchableOpacity style={[styles.postButton, posting && styles.postButtonDisabled]} onPress={handlePost} disabled={posting}>
        {posting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.postButtonText}>Send Announcement</Text>}
      </TouchableOpacity>

      <Text style={styles.historyHeading}>Sent Announcements</Text>
    </View>
  ) : null;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.headerTitle}>Announcements</Text>
        {!isFaculty && <Text style={styles.subtitle}>Quick class updates from faculty</Text>}

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={announcements}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={ComposeForm}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No announcements right now.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.targetPill}>
                    <Text style={styles.targetPillText}>{targetLabel(item)}</Text>
                  </View>
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.author}>{item.createdByName}</Text>
                  {profile?.uid === item.createdBy && (
                    <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 2 },
  emptyContainer: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  targetPill: { backgroundColor: colors.primary + "20", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  targetPillText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  time: { fontSize: 11, color: colors.textSecondary },
  message: { ...typography.body, color: colors.textPrimary },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  author: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic" },

  // Compose form (faculty only)
  composeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, ...clayShadowSoft },
  composeHeader: { ...typography.h3, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.background },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.surface },
  postButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
    ...clayShadowSoft,
  },
  postButtonDisabled: { opacity: 0.6 },
  postButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
  historyHeading: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg },
});
