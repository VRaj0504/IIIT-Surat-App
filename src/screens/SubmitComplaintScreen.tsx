// src/screens/SubmitComplaintScreen.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import {
  submitComplaint,
  subscribeToMyComplaints,
  Complaint,
  ComplaintCategory,
  DoubtCategory,
  IssueType,
} from "../firebase/complaintService";

const statusColors: Record<Complaint["status"], string> = {
  pending: colors.warning,
  resolved: colors.success,
  rejected: colors.danger,
};

const COMPLAINT_CATEGORIES: ComplaintCategory[] = ["Facilities", "Harassment", "Academic", "Other"];
const DOUBT_CATEGORIES: DoubtCategory[] = ["Coursework", "Exam", "Other"];

export default function SubmitComplaintScreen() {
  const { profile } = useAuth();
  const [type, setType] = useState<IssueType>("complaint");
  const [category, setCategory] = useState<ComplaintCategory | DoubtCategory>("Facilities");
  const [subject, setSubject] = useState("");

  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [myComplaints, setMyComplaints] = useState<Complaint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToFacultyDirectory((data) => setFaculty(data));
    return () => unsubscribe();
  }, []);

  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return faculty;
    return faculty.filter((f) => f.name?.toLowerCase().includes(q));
  }, [faculty, facultySearch]);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToMyComplaints(profile.uid, (complaints) => {
      setMyComplaints(complaints);
      setHistoryLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const handleTypeChange = (next: IssueType) => {
    setType(next);
    // Each type has its own category list, so switching resets to that
    // list's first option rather than carrying over a category (like
    // "Harassment") that wouldn't make sense for the other type.
    setCategory(next === "complaint" ? COMPLAINT_CATEGORIES[0] : DOUBT_CATEGORIES[0]);
  };

  const clearFaculty = () => setSelectedFaculty(null);

  const handleSubmit = async () => {
    if (!profile) return;
    const subjectTrimmed = subject.trim();
    const descriptionTrimmed = description.trim();
    if (!subjectTrimmed || !descriptionTrimmed) {
      Alert.alert("Missing details", `Fill in a subject and a description.`);
      return;
    }
    const wordCount = descriptionTrimmed.split(/\s+/).filter(Boolean).length;
    if (descriptionTrimmed.length < 15 || wordCount < 4) {
      Alert.alert(
        "Add more detail",
        type === "complaint"
          ? "Briefly describe what happened, in a few actual sentences — not a placeholder."
          : "Explain what you're stuck on, in a few actual sentences — not a placeholder.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await submitComplaint({
        studentUid: profile.uid,
        studentName: profile.name,
        studentEnrollmentNumber: profile.enrollmentNumber,
        type,
        category,
        ...(selectedFaculty
          ? { facultyEmail: selectedFaculty.email, facultyName: selectedFaculty.name, facultyUid: selectedFaculty.uid }
          : {}),
        subject: subjectTrimmed,
        description: descriptionTrimmed,
      });
      setSubject("");
      setDescription("");
      clearFaculty();
      const noun = type === "complaint" ? "complaint" : "doubt";
      Alert.alert(
        "Submitted",
        selectedFaculty
          ? `Your ${noun} has been sent to ${selectedFaculty.name}.`
          : `Your ${noun} has been sent to admin/faculty for review.`,
      );
    } catch (err: any) {
      Alert.alert("Couldn't submit", err.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.header}>Complaints & Doubts</Text>
          <Text style={styles.subheader}>
            Raise a facilities or conduct issue, or ask an academic question — addressed to a specific faculty
            member if you know who should see it, or to admin/faculty in general.
          </Text>

          <Text style={styles.label}>What is this?</Text>
          <View style={styles.categoryRow}>
            {(["complaint", "doubt"] as IssueType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, type === t && styles.categoryChipActive]}
                onPress={() => handleTypeChange(t)}
              >
                <Text style={[styles.categoryText, type === t && styles.categoryTextActive]}>
                  {t === "complaint" ? "Complaint" : "Doubt"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {(type === "complaint" ? COMPLAINT_CATEGORIES : DOUBT_CATEGORIES).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>
            {type === "complaint" ? "Send to (optional)" : "Which faculty is this for? (optional)"}
          </Text>
          <TouchableOpacity style={styles.dropdownField} onPress={() => setPickerOpen(true)}>
            <Text style={selectedFaculty ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedFaculty
                ? selectedFaculty.name
                : type === "complaint"
                  ? "Any faculty / admin"
                  : "e.g. your subject teacher"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              {selectedFaculty && (
                <TouchableOpacity onPress={clearFaculty} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <Text style={styles.helperText}>
            {selectedFaculty
              ? `Only ${selectedFaculty.name} and admin will see this.`
              : "Left blank, any faculty member or admin can pick this up."}
          </Text>

          <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select faculty</Text>
                  <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={facultySearch}
                  onChangeText={setFacultySearch}
                  placeholder="Search faculty by name"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <FlatList
                  data={filteredFaculty}
                  keyExtractor={(f) => f.uid ?? f.email}
                  style={styles.modalList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.emptyNote}>No faculty match that name.</Text>}
                  renderItem={({ item: f }) => (
                    <TouchableOpacity
                      style={styles.facultyOption}
                      onPress={() => {
                        setSelectedFaculty(f);
                        setFacultySearch("");
                        setPickerOpen(false);
                      }}
                    >
                      <Text style={styles.facultyOptionText}>{f.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>

          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={
              type === "complaint"
                ? 'Short summary, e.g. "Broken AC in Room 204"'
                : 'Short summary, e.g. "Doubt in DBMS normalization"'
            }
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={
              type === "complaint"
                ? "Describe what happened, where, and when"
                : "Describe exactly what you're stuck on"
            }
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>
                {type === "complaint" ? "Submit Complaint" : "Submit Doubt"}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.historyHeader}>Your Submissions</Text>
          {historyLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          ) : myComplaints.length === 0 ? (
            <Text style={styles.emptyText}>Nothing submitted yet.</Text>
          ) : (
            myComplaints.map((c) => (
              <View key={c.id} style={styles.historyCard}>
                <View style={styles.historyHeaderRow}>
                  <Text style={styles.historyTitle}>{c.subject}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColors[c.status] + "20" }]}>
                    <Text style={[styles.statusPillText, { color: statusColors[c.status] }]}>{c.status}</Text>
                  </View>
                </View>
                <Text style={styles.historySubtitle}>
                  {c.type === "complaint" ? "Complaint" : "Doubt"} · {c.category}
                  {c.facultyName ? ` · To ${c.facultyName}` : ""}
                </Text>
                <Text style={styles.historyReason}>{c.description}</Text>
                {c.facultyRemark && (
                  <Text style={styles.historyRemark}>Remark: {c.facultyRemark}</Text>
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
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  subheader: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dropdownField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dropdownValue: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  dropdownPlaceholder: { ...typography.body, color: colors.textSecondary },
  helperText: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "75%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  modalList: { marginTop: spacing.sm },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.md, textAlign: "center" },
  facultyOption: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  facultyOptionText: { ...typography.body, color: colors.textPrimary },
  categoryText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  categoryTextActive: { color: colors.surface },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
  historyHeader: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary },
  historyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...clayShadowSoft },
  historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  historySubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyReason: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  historyRemark: { fontSize: 12, color: colors.textPrimary, marginTop: 4, fontStyle: "italic" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});