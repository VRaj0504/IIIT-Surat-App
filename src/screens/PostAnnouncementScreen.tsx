import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  postAnnouncement,
  getAdmissionYears,
  getClassOptionsForYear,
  ClassOption,
} from "../firebase/announcementsService";

export default function PostAnnouncementScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation();

  const [years, setYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null);

  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  // Load the distinct admission years present in the roster once.
  useEffect(() => {
    getAdmissionYears()
      .then(setYears)
      .catch(() => setYears([]))
      .finally(() => setYearsLoading(false));
  }, []);

  // When a year is picked, load exactly the classes (branch + section) that
  // exist for it — so the buttons always match real, current roster data.
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
        createdBy: profile.uid,
        createdByName: profile.name,
      });
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Couldn't post", err.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>Quick Announcement</Text>
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
                  <Text style={[styles.chipText, selectedYear === y && styles.chipTextActive]}>{y}</Text>
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
                    const active =
                      selectedClass?.branch === c.branch && selectedClass?.section === c.section;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedClass(c)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
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

          <TouchableOpacity
            style={[styles.postButton, posting && styles.postButtonDisabled]}
            onPress={handlePost}
            disabled={posting}
          >
            {posting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.postButtonText}>Send Announcement</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.surface },
  postButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  postButtonDisabled: { opacity: 0.6 },
  postButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
});
