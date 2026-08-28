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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import {
  applyForLeave,
  subscribeToMyLeaveApplications,
  LeaveApplication,
  LeaveType,
} from "../firebase/leaveService";

const statusColors: Record<LeaveApplication["status"], string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

export default function ApplyLeaveScreen() {
  const { profile } = useAuth();
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [type, setType] = useState<LeaveType>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [myApplications, setMyApplications] = useState<LeaveApplication[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToFacultyDirectory((data) => setFaculty(data));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToMyLeaveApplications(profile.uid, (apps) => {
      setMyApplications(apps);
      setHistoryLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return faculty;
    return faculty.filter((f) => f.name?.toLowerCase().includes(q));
  }, [faculty, facultySearch]);

  const handleSubmit = async () => {
    if (!profile) return;
    if (!selectedFaculty) {
      Alert.alert("Pick a faculty member", "Choose who this request is addressed to.");
      return;
    }
    if (!fromDate.trim() || !toDate.trim() || !reason.trim()) {
      Alert.alert("Missing details", "Fill in the dates and a reason.");
      return;
    }
    setSubmitting(true);
    try {
      await applyForLeave({
        studentUid: profile.uid,
        studentName: profile.name,
        studentEnrollmentNumber: profile.enrollmentNumber,
        facultyEmail: selectedFaculty.email,
        facultyUid: selectedFaculty.uid,
        facultyName: selectedFaculty.name,
        type,
        fromDate: fromDate.trim(),
        toDate: toDate.trim(),
        reason,
      });
      setSelectedFaculty(null);
      setFromDate("");
      setToDate("");
      setReason("");
      Alert.alert("Submitted", `Your leave request was sent to ${selectedFaculty.name}.`);
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
          <Text style={styles.header}>Apply for Leave</Text>

          <Text style={styles.label}>Type</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, type === "casual" && styles.toggleButtonActive]}
              onPress={() => setType("casual")}
            >
              <Text style={[styles.toggleText, type === "casual" && styles.toggleTextActive]}>Casual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, type === "medical" && styles.toggleButtonActive]}
              onPress={() => setType("medical")}
            >
              <Text style={[styles.toggleText, type === "medical" && styles.toggleTextActive]}>Medical</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Addressed to</Text>
          {selectedFaculty ? (
            <View style={styles.selectedFacultyRow}>
              <Text style={styles.selectedFacultyText}>{selectedFaculty.name}</Text>
              <TouchableOpacity onPress={() => setSelectedFaculty(null)}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={facultySearch}
                onChangeText={setFacultySearch}
                placeholder="Search faculty by name"
                placeholderTextColor={colors.textSecondary}
              />
              <View style={styles.facultyList}>
                {filteredFaculty.slice(0, 6).map((f) => (
                  <TouchableOpacity
                    key={f.uid ?? f.email}
                    style={styles.facultyOption}
                    onPress={() => {
                      setSelectedFaculty(f);
                      setFacultySearch("");
                    }}
                  >
                    <Text style={styles.facultyOptionText}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>From</Text>
          <TextInput
            style={styles.input}
            value={fromDate}
            onChangeText={setFromDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.label}>To</Text>
          <TextInput
            style={styles.input}
            value={toDate}
            onChangeText={setToDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={reason}
            onChangeText={setReason}
            placeholder="Briefly explain why you need this leave"
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitButtonText}>Submit Request</Text>}
          </TouchableOpacity>

          <Text style={styles.historyHeader}>Your Requests</Text>
          {historyLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          ) : myApplications.length === 0 ? (
            <Text style={styles.emptyText}>No leave requests yet.</Text>
          ) : (
            myApplications.map((app) => (
              <View key={app.id} style={styles.historyCard}>
                <View style={styles.historyHeaderRow}>
                  <Text style={styles.historyTitle}>
                    {app.type === "medical" ? "Medical" : "Casual"} · {app.fromDate} to {app.toDate}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColors[app.status] + "20" }]}>
                    <Text style={[styles.statusPillText, { color: statusColors[app.status] }]}>{app.status}</Text>
                  </View>
                </View>
                <Text style={styles.historySubtitle}>To {app.facultyName}</Text>
                <Text style={styles.historyReason}>{app.reason}</Text>
                {app.facultyRemark && (
                  <Text style={styles.historyRemark}>Remark: {app.facultyRemark}</Text>
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
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.full, padding: 4 },
  toggleButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, alignItems: "center" },
  toggleButtonActive: { backgroundColor: colors.primary },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  toggleTextActive: { color: colors.surface },
  selectedFacultyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedFacultyText: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  facultyList: { marginTop: spacing.xs, gap: 2 },
  facultyOption: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  facultyOptionText: { ...typography.body, color: colors.textPrimary },
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
