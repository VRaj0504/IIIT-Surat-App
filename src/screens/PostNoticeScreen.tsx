import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  createNotice,
  updateNotice,
  deleteNotice,
  Notice,
} from "../firebase/noticesService";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PostNoticeRoute = RouteProp<RootStackParamList, "PostNotice">;

// Categories a faculty member can pick from when posting a general notice
// (not tied to a specific club).
const GENERAL_CATEGORIES: Notice["category"][] = [
  "Academic",
  "Placement",
  "Event",
  "General",
];

const BRANCHES = ["CSE", "ECE", "MNC"] as const;

export default function PostNoticeScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<PostNoticeRoute>();
  const { clubId, clubName, editingNotice } = route.params ?? {};
  const { user, profile } = useAuth();

  const isClubNotice = !!clubId && !!clubName;
  const isEditing = !!editingNotice;

  const [title, setTitle] = useState(editingNotice?.title ?? "");
  const [description, setDescription] = useState(
    editingNotice?.description ?? "",
  );
  const [link, setLink] = useState(editingNotice?.link ?? "");
  const [category, setCategory] = useState<Notice["category"]>(
    editingNotice?.category ?? (isClubNotice ? "Club" : "General"),
  );
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Targeting — a General/Academic/Placement notice can optionally be
  // scoped to one branch, one section within it, and/or one admission
  // year. Any of these left unset ("Everyone") reaches every student on
  // that dimension. Not shown for club notices (those stay open to
  // everyone interested, same as before).
  const [targetBranch, setTargetBranch] = useState<(typeof BRANCHES)[number] | null>(
    (editingNotice?.targetBranch as (typeof BRANCHES)[number] | undefined) ?? null,
  );
  const [targetSection, setTargetSection] = useState(editingNotice?.targetSection ?? "");
  const [targetAdmissionYear, setTargetAdmissionYear] = useState(
    editingNotice?.targetAdmissionYear ? String(editingNotice.targetAdmissionYear) : "",
  );

  const handlePost = async () => {
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError("Fill in a title and description.");
      return;
    }
    if (!user || !profile) {
      setError("You must be signed in to post a notice.");
      return;
    }
    setLoading(true);
    try {
      const targeting = isClubNotice
        ? undefined
        : {
            branch: targetBranch,
            section: targetSection.trim() || null,
            admissionYear: targetAdmissionYear.trim() ? Number(targetAdmissionYear.trim()) : null,
          };
      if (isEditing) {
        await updateNotice(
          editingNotice.id,
          title.trim(),
          description.trim(),
          link.trim(),
          targeting,
        );
      } else {
        await createNotice(
          title.trim(),
          description.trim(),
          category,
          user.uid,
          profile.name,
          isClubNotice ? { id: clubId!, name: clubName! } : undefined,
          link.trim() || undefined,
          targeting,
        );
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNotice) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteNotice(editingNotice.id);
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? "Could not delete. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {isEditing ? "Edit Notice" : "Post Notice"}
            </Text>
            <Text style={styles.subtitle}>
              {isClubNotice ? clubName : "Campus-wide"}
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            {!isClubNotice && !isEditing && (
              <>
                <Text style={styles.label}>Category</Text>
                <View style={styles.categoryRow}>
                  {GENERAL_CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.categoryChip,
                        category === c && styles.categoryChipActive,
                      ]}
                      onPress={() => setCategory(c)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          category === c && styles.categoryChipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!isClubNotice && (
              <>
                <Text style={styles.label}>Who's this for? (leave blank for everyone)</Text>
                <View style={styles.categoryRow}>
                  <TouchableOpacity
                    style={[styles.categoryChip, targetBranch === null && styles.categoryChipActive]}
                    onPress={() => setTargetBranch(null)}
                  >
                    <Text style={[styles.categoryChipText, targetBranch === null && styles.categoryChipTextActive]}>
                      Everyone
                    </Text>
                  </TouchableOpacity>
                  {BRANCHES.map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={[styles.categoryChip, targetBranch === b && styles.categoryChipActive]}
                      onPress={() => setTargetBranch(b)}
                    >
                      <Text style={[styles.categoryChipText, targetBranch === b && styles.categoryChipTextActive]}>
                        {b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {targetBranch && (
                  <>
                    <Text style={styles.label}>Section (optional — e.g. CSE1, leave blank for all sections)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. CSE1"
                      placeholderTextColor={colors.textSecondary}
                      value={targetSection}
                      onChangeText={setTargetSection}
                      autoCapitalize="characters"
                    />

                    <Text style={styles.label}>Admission Year (optional — leave blank for all years)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 2024"
                      placeholderTextColor={colors.textSecondary}
                      value={targetAdmissionYear}
                      onChangeText={setTargetAdmissionYear}
                      keyboardType="number-pad"
                    />
                  </>
                )}
              </>
            )}

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Mid-sem exam schedule released"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Details students need to know..."
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>
              Drive Link (optional — timetable, syllabus, midsem schedule, etc.)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="https://drive.google.com/..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
              value={link}
              onChangeText={setLink}
            />

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handlePost}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isEditing ? "Save Changes" : "Post Notice"}
                </Text>
              )}
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={styles.deleteBtnText}>Delete Notice</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.danger,
    backgroundColor: "#FCEAEB",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    ...typography.caption,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    ...clayShadowSoft,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  categoryChipTextActive: { color: "#fff" },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  deleteBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteBtnText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
});
