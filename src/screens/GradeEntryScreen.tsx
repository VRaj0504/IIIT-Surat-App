import React, { useState, useEffect, useMemo } from "react";
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
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getAdmissionYears, getClassOptionsForYear, yearOfStudyLabel, ClassOption } from "../firebase/announcementsService";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { getClassRoster, getExistingGrades, setGrade, GRADES, RosterStudent, GradeEntry } from "../firebase/gradesService";
import LoadingSpinner from "../components/LoadingSpinner";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function GradeEntryScreen() {
  const { profile } = useAuth();

  // Step 1: which class (year + branch/section) is being graded.
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);

  // Step 2: which subject (drives the curriculum semester + default credits).
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number] | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<CurriculumSubject | null>(null);
  const [creditsOverride, setCreditsOverride] = useState("");

  // Step 3: the roster + grades being entered.
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingGrades, setExistingGrades] = useState<Map<string, GradeEntry>>(new Map());
  const [draftGrades, setDraftGrades] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

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

  // Once class + subject are both picked (and specialization too, when the
  // class has more than one), load the roster and any grades already
  // entered for this exact class+subject combination.
  useEffect(() => {
    const needsSpecialization = selectedClass && selectedClass.specializations.length > 0;
    if (!selectedClass || selectedYear === null || !selectedSubject || (needsSpecialization && !selectedSpecialization)) {
      setRoster([]);
      setExistingGrades(new Map());
      return;
    }
    const specFilter = selectedSpecialization === "__ALL__" ? null : selectedSpecialization;
    setRosterLoading(true);
    getClassRoster(selectedYear, selectedClass.branch, selectedClass.section, specFilter)
      .then(async (students) => {
        setRoster(students);
        const existing = await getExistingGrades(students, selectedSubject.code);
        setExistingGrades(existing);
        const prefill: Record<string, string> = {};
        existing.forEach((g, enrollmentNumber) => {
          prefill[enrollmentNumber] = g.grade;
        });
        setDraftGrades(prefill);
      })
      .catch(() => {
        setRoster([]);
        setExistingGrades(new Map());
      })
      .finally(() => setRosterLoading(false));
  }, [selectedClass, selectedYear, selectedSubject, selectedSpecialization]);

  const resolvedCredits = useMemo(() => {
    if (selectedSubject?.credits) return selectedSubject.credits;
    const typed = Number(creditsOverride.trim());
    return typed > 0 ? typed : null;
  }, [selectedSubject, creditsOverride]);

  const handleSetGrade = async (student: RosterStudent, grade: string) => {
    if (!profile || !selectedClass || selectedYear === null || !selectedSubject || !semester) return;
    if (!resolvedCredits) {
      Alert.alert("Credits needed", "This subject has no credits on file yet — type them in above first.");
      return;
    }
    setDraftGrades((prev) => ({ ...prev, [student.enrollmentNumber]: grade }));
    setSaving((prev) => ({ ...prev, [student.enrollmentNumber]: true }));
    try {
      await setGrade({
        studentEnrollmentNumber: student.enrollmentNumber,
        studentName: student.name,
        studentUid: student.uid ?? null,
        branch: selectedClass.branch,
        section: selectedClass.section,
        admissionYear: selectedYear,
        subjectCode: selectedSubject.code,
        subjectName: selectedSubject.name,
        subjectSemester: semester,
        credits: resolvedCredits,
        grade,
        enteredBy: profile.uid,
        enteredByName: profile.name,
      });
    } catch (err: any) {
      Alert.alert("Couldn't save", err.message ?? "Please try again.");
    } finally {
      setSaving((prev) => ({ ...prev, [student.enrollmentNumber]: false }));
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>Enter Grades</Text>

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
                    <Text style={[styles.chipText, selectedSpecialization === spec && styles.chipTextActive]}>
                      {spec}
                    </Text>
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
                      <Text
                        style={[styles.chipText, selectedSubject?.code === s.code && styles.chipTextActive]}
                      >
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {selectedSubject && !selectedSubject.credits && (
            <>
              <Text style={styles.label}>Credits (not set for this subject yet)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4"
                placeholderTextColor={colors.textSecondary}
                value={creditsOverride}
                onChangeText={setCreditsOverride}
                keyboardType="number-pad"
              />
            </>
          )}
        </View>

        {selectedSubject && resolvedCredits && (
          <>
            {rosterLoading ? (
              <LoadingSpinner style={{ marginTop: spacing.lg }} />
            ) : roster.length === 0 ? (
              <Text style={styles.emptyNote}>No students found in this class.</Text>
            ) : (
              <FlatList
                data={roster}
                keyExtractor={(item) => item.enrollmentNumber}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.studentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{item.name}</Text>
                      <Text style={styles.studentReg}>{item.enrollmentNumber}</Text>
                    </View>
                    {saving[item.enrollmentNumber] ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <View style={styles.gradeChipRow}>
                        {GRADES.map((g) => (
                          <TouchableOpacity
                            key={g}
                            style={[
                              styles.gradeChip,
                              draftGrades[item.enrollmentNumber] === g && styles.gradeChipActive,
                            ]}
                            onPress={() => handleSetGrade(item, g)}
                          >
                            <Text
                              style={[
                                styles.gradeChipText,
                                draftGrades[item.enrollmentNumber] === g && styles.gradeChipTextActive,
                              ]}
                            >
                              {g}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              />
            )}
          </>
        )}
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
  listContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  studentName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  studentReg: { fontSize: 11, color: colors.textSecondary },
  gradeChipRow: { flexDirection: "row", gap: 4 },
  gradeChip: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  gradeChipActive: { backgroundColor: colors.primary },
  gradeChipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  gradeChipTextActive: { color: colors.surface },
});
