import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getAdmissionYears, getClassOptionsForYear, yearOfStudyLabel, ClassOption } from "../firebase/announcementsService";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { getClassRoster, RosterStudent } from "../firebase/gradesService";
import { markAttendance, getExistingSession } from "../firebase/attendanceService";
import LoadingSpinner from "../components/LoadingSpinner";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function MarkAttendanceScreen() {
  const { profile } = useAuth();

  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);

  const [semester, setSemester] = useState<(typeof SEMESTERS)[number] | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<CurriculumSubject | null>(null);

  const [date, setDate] = useState(todayDateString());

  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [absentSet, setAbsentSet] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdmissionYears().then(setYears).catch(() => setYears([]));
  }, []);

  useEffect(() => {
    if (selectedYear === null) {
      setClassOptions([]);
      return;
    }
    setClassesLoading(true);
    setSelectedClass(null);
    getClassOptionsForYear(selectedYear)
      .then(setClassOptions)
      .catch(() => setClassOptions([]))
      .finally(() => setClassesLoading(false));
  }, [selectedYear]);

  useEffect(() => {
    if (!selectedClass || semester === null) {
      setSubjects([]);
      return;
    }
    const unsubscribe = subscribeToCurriculum(selectedClass.branch, semester, setSubjects);
    return () => unsubscribe();
  }, [selectedClass, semester]);

  useEffect(() => {
    const needsSpecialization = selectedClass && selectedClass.specializations.length > 0;
    if (!selectedClass || selectedYear === null || !selectedSubject || !date.trim() || (needsSpecialization && !selectedSpecialization)) {
      setRoster([]);
      setAbsentSet(new Set());
      return;
    }
    const specFilter = selectedSpecialization === "__ALL__" ? null : selectedSpecialization;
    setRosterLoading(true);
    Promise.all([
      getClassRoster(selectedYear, selectedClass.branch, selectedClass.section, specFilter),
      getExistingSession({
        branch: selectedClass.branch,
        admissionYear: selectedYear,
        section: selectedClass.section,
        subjectCode: selectedSubject.code,
        date: date.trim(),
      }),
    ])
      .then(([students, existingAbsentees]) => {
        setRoster(students);
        setAbsentSet(new Set(existingAbsentees ?? []));
      })
      .catch(() => {
        setRoster([]);
        setAbsentSet(new Set());
      })
      .finally(() => setRosterLoading(false));
  }, [selectedClass, selectedYear, selectedSubject, selectedSpecialization, date]);

  const toggleAbsent = (enrollmentNumber: string) => {
    setAbsentSet((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentNumber)) next.delete(enrollmentNumber);
      else next.add(enrollmentNumber);
      return next;
    });
  };

  const handleSave = async () => {
    if (!profile || !selectedClass || selectedYear === null || !selectedSubject || !date.trim()) return;
    setSaving(true);
    try {
      await markAttendance({
        branch: selectedClass.branch,
        admissionYear: selectedYear,
        section: selectedClass.section,
        subjectCode: selectedSubject.code,
        subjectName: selectedSubject.name,
        date: date.trim(),
        absentEnrollmentNumbers: Array.from(absentSet),
        markedBy: profile.uid,
      });
      Alert.alert("Saved", `Attendance recorded for ${roster.length - absentSet.size} of ${roster.length} present.`);
    } catch (err: any) {
      Alert.alert("Couldn't save", err.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const ListHeader = (
    <View>
      <Text style={styles.header}>Mark Attendance</Text>

      <View style={styles.pickersArea}>
        <Text style={styles.label}>Year (batch)</Text>
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

        {selectedYear !== null && (
          <>
            <Text style={styles.label}>Class</Text>
            {classesLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.chipRow}>
                {classOptions.map((c) => {
                  const active = selectedClass?.branch === c.branch && selectedClass?.section === c.section;
                  return (
                    <TouchableOpacity
                      key={`${c.branch}||${c.section ?? ""}`}
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

        {selectedClass && (
          <>
            <Text style={styles.label}>Semester</Text>
            <View style={styles.chipRow}>
              {SEMESTERS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, semester === s && styles.chipActive]}
                  onPress={() => {
                    setSemester(s);
                    setSelectedSubject(null);
                  }}
                >
                  <Text style={[styles.chipText, semester === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {semester !== null && selectedClass && (
          <>
            <Text style={styles.label}>Subject</Text>
            {subjects.length === 0 ? (
              <Text style={styles.emptyNote}>No subjects found for {selectedClass.branch} sem {semester}.</Text>
            ) : (
              <View style={styles.chipRow}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.code}
                    style={[styles.chip, selectedSubject?.code === s.code && styles.chipActive]}
                    onPress={() => setSelectedSubject(s)}
                  >
                    <Text style={[styles.chipText, selectedSubject?.code === s.code && styles.chipTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {selectedSubject && (
          <>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </>
        )}
      </View>

      {selectedSubject && date.trim() && (
        <>
          {rosterLoading && (
            <LoadingSpinner style={{ marginTop: spacing.lg }} />
          )}
          {!rosterLoading && roster.length === 0 && (
            <Text style={styles.emptyNote}>No students found in this class.</Text>
          )}
          {!rosterLoading && roster.length > 0 && (
            <Text style={styles.helperNote}>
              Everyone starts marked Present — tap a name to mark them Absent instead.
            </Text>
          )}
        </>
      )}
    </View>
  );

  const ListFooter =
    selectedSubject && date.trim() && !rosterLoading && roster.length > 0 ? (
      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.saveButtonText}>
            Save — {roster.length - absentSet.size} Present, {absentSet.size} Absent
          </Text>
        )}
      </TouchableOpacity>
    ) : null;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <FlatList
          data={selectedSubject && date.trim() && !rosterLoading ? roster : []}
          keyExtractor={(item) => item.enrollmentNumber}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          renderItem={({ item }) => {
            const isAbsent = absentSet.has(item.enrollmentNumber);
            return (
              <TouchableOpacity
                style={[styles.studentRow, isAbsent && styles.studentRowAbsent]}
                onPress={() => toggleAbsent(item.enrollmentNumber)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>{item.name}</Text>
                  <Text style={styles.studentReg}>{item.enrollmentNumber}</Text>
                </View>
                <View style={[styles.statusPill, isAbsent ? styles.statusPillAbsent : styles.statusPillPresent]}>
                  <Ionicons
                    name={isAbsent ? "close-circle" : "checkmark-circle"}
                    size={14}
                    color={colors.surface}
                  />
                  <Text style={styles.statusPillText}>{isAbsent ? "Absent" : "Present"}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  pickersArea: { paddingHorizontal: spacing.lg },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.xs, paddingHorizontal: spacing.lg },
  helperNote: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.body, color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.surface },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    ...clayShadowSoft,
  },
  studentRowAbsent: { backgroundColor: colors.danger + "15" },
  studentName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  studentReg: { fontSize: 11, color: colors.textSecondary },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  statusPillPresent: { backgroundColor: colors.success },
  statusPillAbsent: { backgroundColor: colors.danger },
  statusPillText: { color: colors.surface, fontSize: 11, fontWeight: "700" },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
    ...clayShadowSoft,
  },
  saveButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
