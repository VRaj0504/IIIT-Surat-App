import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  isEventCoordinator,
  submitEventExcusal,
  subscribeToMySubmittedExcusals,
  searchWholeRoster,
  RosterSearchResult,
  EventExcusal,
} from "../firebase/eventExcusalService";

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending: { color: colors.warning, label: "Pending" },
  approved: { color: colors.success, label: "Approved" },
  rejected: { color: colors.danger, label: "Rejected" },
};

export default function SubmitEventExcusalScreen() {
  const { profile } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isCoordinator, setIsCoordinator] = useState(false);

  const [eventName, setEventName] = useState("");
  const [fromDate, setFromDate] = useState(todayDateString());
  const [toDate, setToDate] = useState(todayDateString());

  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<RosterSearchResult[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<RosterSearchResult[]>([]);

  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [myExcusals, setMyExcusals] = useState<EventExcusal[]>([]);

  useEffect(() => {
    if (!profile?.email) return;
    isEventCoordinator(profile.email).then((result) => {
      setIsCoordinator(result);
      setCheckingAccess(false);
    });
  }, [profile?.email]);

  useEffect(() => {
    const unsubscribe = subscribeToFacultyDirectory(setFaculty);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToMySubmittedExcusals(profile.uid, setMyExcusals);
    return () => unsubscribe();
  }, [profile?.uid]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (studentQuery.trim().length >= 2) {
        searchWholeRoster(studentQuery).then(setStudentResults);
      } else {
        setStudentResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [studentQuery]);

  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return [];
    return faculty.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 10);
  }, [faculty, facultySearch]);

  const addStudent = (student: RosterSearchResult) => {
    if (selectedStudents.some((s) => s.regNo === student.regNo)) return;
    setSelectedStudents((prev) => [...prev, student]);
    setStudentQuery("");
    setStudentResults([]);
  };

  const removeStudent = (regNo: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.regNo !== regNo));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (!eventName.trim() || !fromDate.trim() || !toDate.trim()) {
      Alert.alert("Missing details", "Fill in the event name and date range.");
      return;
    }
    if (selectedStudents.length === 0) {
      Alert.alert("No students added", "Add at least one participating student.");
      return;
    }
    if (!selectedFaculty) {
      Alert.alert("Pick a faculty coordinator", "Choose who should review and approve this.");
      return;
    }
    setSubmitting(true);
    try {
      await submitEventExcusal({
        eventName,
        fromDate: fromDate.trim(),
        toDate: toDate.trim(),
        studentEnrollmentNumbers: selectedStudents.map((s) => s.regNo),
        facultyCoordinatorUid: selectedFaculty.uid!,
        facultyCoordinatorName: selectedFaculty.name,
        facultyCoordinatorEmail: selectedFaculty.email,
        submittedBy: profile.uid,
        submittedByName: profile.name,
      });
      setEventName("");
      setSelectedStudents([]);
      setSelectedFaculty(null);
      setFacultySearch("");
      Alert.alert("Submitted", `Sent to ${selectedFaculty.name} for approval.`);
    } catch (err: any) {
      Alert.alert("Couldn't submit", err.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAccess) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!isCoordinator) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.emptyContainer}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>
              You're not currently designated as an event coordinator. Contact admin if this
              should change.
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <FlatList
          data={myExcusals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <Text style={styles.header}>Submit Event Excusal</Text>
              <Text style={styles.helper}>
                Nothing is excused until the faculty coordinator you pick approves it — students
                stay covered automatically across all their subjects once that happens.
              </Text>

              <Text style={styles.label}>Event Name</Text>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="e.g. Inter-IIIT Hackathon 2026"
                placeholderTextColor={colors.textSecondary}
              />

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>From Date</Text>
                  <TextInput style={styles.input} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>To Date</Text>
                  <TextInput style={styles.input} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
                </View>
              </View>

              <Text style={styles.label}>Participating Students</Text>
              <TextInput
                style={styles.input}
                value={studentQuery}
                onChangeText={setStudentQuery}
                placeholder="Search by name or enrollment number"
                placeholderTextColor={colors.textSecondary}
              />
              {studentResults.map((s) => (
                <TouchableOpacity key={s.regNo} style={styles.resultRow} onPress={() => addStudent(s)}>
                  <Text style={styles.resultText}>{s.name} — {s.regNo}</Text>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))}

              {selectedStudents.length > 0 && (
                <View style={styles.chipRow}>
                  {selectedStudents.map((s) => (
                    <View key={s.regNo} style={styles.selectedChip}>
                      <Text style={styles.selectedChipText}>{s.name}</Text>
                      <TouchableOpacity onPress={() => removeStudent(s.regNo)} hitSlop={6}>
                        <Ionicons name="close" size={14} color={colors.surface} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Faculty Coordinator (who approves this)</Text>
              <TextInput
                style={styles.input}
                value={selectedFaculty ? selectedFaculty.name : facultySearch}
                onChangeText={(text) => {
                  setFacultySearch(text);
                  setSelectedFaculty(null);
                }}
                placeholder="Search faculty by name"
                placeholderTextColor={colors.textSecondary}
              />
              {!selectedFaculty &&
                filteredFaculty.map((f) => (
                  <TouchableOpacity key={f.uid ?? f.email} style={styles.resultRow} onPress={() => setSelectedFaculty(f)}>
                    <Text style={styles.resultText}>{f.name}</Text>
                  </TouchableOpacity>
                ))}

              <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitButtonText}>Submit for Approval</Text>}
              </TouchableOpacity>

              <Text style={styles.historyHeader}>Your Submissions</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyNote}>No submissions yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.historyCard}>
              <View style={styles.historyHeaderRow}>
                <Text style={styles.historyEvent}>{item.eventName}</Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_STYLE[item.status].color }]}>
                  <Text style={styles.statusPillText}>{STATUS_STYLE[item.status].label}</Text>
                </View>
              </View>
              <Text style={styles.historyDetail}>{item.fromDate} to {item.toDate} · {item.studentEnrollmentNumbers.length} students</Text>
              <Text style={styles.historyDetail}>Assigned to {item.facultyCoordinatorName}</Text>
              {item.facultyRemark && <Text style={styles.historyRemark}>Remark: {item.facultyRemark}</Text>}
            </View>
          )}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  helper: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600", marginHorizontal: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  resultText: { ...typography.body, color: colors.textPrimary, fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  selectedChipText: { color: colors.surface, fontSize: 12, fontWeight: "600" },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    ...clayShadowSoft,
  },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
  historyHeader: { ...typography.h3, color: colors.textPrimary, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  listContent: { paddingBottom: spacing.xl },
  emptyNote: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyEvent: { ...typography.body, color: colors.textPrimary, fontWeight: "700", flex: 1 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusPillText: { color: colors.surface, fontSize: 10, fontWeight: "700" },
  historyDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyRemark: { fontSize: 12, color: colors.textPrimary, marginTop: 4, fontStyle: "italic" },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyText: { ...typography.body, color: colors.textPrimary, textAlign: "center" },
});
