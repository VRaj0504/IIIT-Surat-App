import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
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
import { ATTEMPT_TYPES, ATTEMPT_LABELS, AttemptType } from "../utils/examRules";

import { SelectField, SheetPicker } from "../components/ui";
import { subscribeToFacultyTimetable } from "../firebase/timetableService";

const ENTRY_SPECIAL_GRADES = ["II", "NA", "XX", "WW"];
import LoadingSpinner from "../components/LoadingSpinner";
import { KeyboardAwareFlatList } from "../components/KeyboardAware";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const StudentGradeRow = memo(function StudentGradeRow({
  item,
  currentGrade,
  isSaving,
  onSetGrade,
}: {
  item: RosterStudent;
  currentGrade: string | undefined;
  isSaving: boolean;
  onSetGrade: (student: RosterStudent, grade: string) => void;
}) {
  return (
    <View style={styles.studentRow}>
      <View>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentReg}>{item.enrollmentNumber}</Text>
      </View>
      {isSaving ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.gradeChipRow}>
          {GRADES.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.gradeChip, currentGrade === g && styles.gradeChipActive]}
              onPress={() => onSetGrade(item, g)}
            >
              <Text style={[styles.gradeChipText, currentGrade === g && styles.gradeChipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
          {ENTRY_SPECIAL_GRADES.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.gradeChip, styles.gradeChipSpecial, currentGrade === g && styles.gradeChipSpecialActive]}
              onPress={() => onSetGrade(item, g)}
            >
              <Text style={[styles.gradeChipText, { color: colors.danger }, currentGrade === g && styles.gradeChipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

export default function GradeEntryScreen() {
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
  const [creditsOverride, setCreditsOverride] = useState("");
  const [attempt, setAttempt] = useState<AttemptType>("regular");

  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingGrades, setExistingGrades] = useState<Map<string, GradeEntry>>(new Map());
  const [draftGrades, setDraftGrades] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<null | "year" | "class" | "spec" | "sem" | "subject" | "attempt">(null);
  const [prefilled, setPrefilled] = useState(false);
  const pending = useRef<{ branch: string; section: string; semester: number; subjectCode: string } | null>(null);
  const triedPrefill = useRef(false);

  // Open on the faculty member's most-taught class from the timetable (they can change any field).
  useEffect(() => {
    if (!profile?.name || triedPrefill.current) return;
    const unsub = subscribeToFacultyTimetable(profile.name, (entries) => {
      if (triedPrefill.current || entries.length === 0) return;
      triedPrefill.current = true;
      const count = new Map<string, { n: number; e: (typeof entries)[number] }>();
      entries.forEach((e) => {
        const k = `${e.branch}|${e.section}|${e.semester}|${e.subjectCode}`;
        const c = count.get(k);
        count.set(k, { n: (c?.n ?? 0) + 1, e });
      });
      const top = [...count.values()].sort((x, y) => y.n - x.n)[0]?.e;
      if (!top?.semester) return;
      const now = new Date();
      const ayStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
      const admission = ayStart - Math.ceil(Number(top.semester) / 2) + 1;
      pending.current = { branch: top.branch, section: top.section, semester: Number(top.semester), subjectCode: top.subjectCode };
      setSelectedYear((cur) => cur ?? admission);
    });
    return () => unsub();
  }, [profile?.name]);

  useEffect(() => {
    const p = pending.current;
    if (!p || selectedClass || classOptions.length === 0) return;
    const sq = (x: unknown) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const sec = (b: string, x: unknown) => sq(x).replace(/^(SECTION|SEC)/, "").replace(new RegExp(`^${sq(b)}`), "");
    const match =
      classOptions.find((c) => sq(c.branch) === sq(p.branch) && sec(c.branch, c.section) === sec(p.branch, p.section)) ??
      classOptions.find((c) => sq(c.branch) === sq(p.branch));
    if (!match) {
      pending.current = null;
      return;
    }
    setSelectedClass(match);
    if (match.specializations.length > 0) setSelectedSpecialization("__ALL__");
    setSemester(p.semester as (typeof SEMESTERS)[number]);
  }, [classOptions, selectedClass]);

  useEffect(() => {
    const p = pending.current;
    if (!p || selectedSubject || subjects.length === 0) return;
    const sub = subjects.find((x) => x.code.toUpperCase().replace(/\s/g, "") === p.subjectCode.toUpperCase().replace(/\s/g, ""));
    pending.current = null;
    if (sub) {
      setSelectedSubject(sub);
      setPrefilled(true);
    }
  }, [subjects, selectedSubject]);

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

  const handleSetGrade = useCallback(
    async (student: RosterStudent, grade: string) => {
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
          attempt,
          enteredBy: profile.uid,
          enteredByName: profile.name,
        });
      } catch (err: any) {
        Alert.alert("Couldn't save", err.message ?? "Please try again.");
      } finally {
        setSaving((prev) => ({ ...prev, [student.enrollmentNumber]: false }));
      }
    },
    [profile, selectedClass, selectedYear, selectedSubject, semester, resolvedCredits, attempt],
  );

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAwareFlatList
          data={selectedSubject && resolvedCredits && !rosterLoading ? roster : []}
          keyExtractor={(item) => item.enrollmentNumber}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <View style={{ marginHorizontal: -spacing.md }}>
        <View style={styles.pickersArea}>
          {prefilled && (
            <Text style={styles.prefillNote}>Opened on your class from the timetable. Change any field below.</Text>
          )}
          <SelectField
            label="Batch"
            value={selectedYear !== null ? yearOfStudyLabel(selectedYear) : null}
            placeholder="Choose batch"
            icon="people-outline"
            onPress={() => setSheet("year")}
          />
          {selectedYear !== null && (
            <SelectField
              label="Class"
              value={selectedClass?.label ?? null}
              placeholder={classesLoading ? "Loading classes…" : "Choose class"}
              icon="school-outline"
              disabled={classesLoading}
              onPress={() => setSheet("class")}
            />
          )}
          {selectedClass && selectedClass.specializations.length > 0 && (
            <SelectField
              label={`Specialization (${selectedClass.label} has more than one)`}
              value={selectedSpecialization === "__ALL__" ? `All of ${selectedClass.label}` : selectedSpecialization}
              placeholder="Choose specialization"
              icon="git-branch-outline"
              onPress={() => setSheet("spec")}
            />
          )}
          {selectedClass && (
            <SelectField
              label="Semester"
              value={semester !== null ? `Semester ${semester}` : null}
              placeholder="Choose semester"
              icon="calendar-outline"
              onPress={() => setSheet("sem")}
            />
          )}
          {semester !== null && selectedClass && (
            subjects.length === 0 ? (
              <Text style={styles.emptyNote}>No subjects found for {selectedClass.branch} sem {semester}.</Text>
            ) : (
              <SelectField
                label="Subject"
                value={selectedSubject ? `${selectedSubject.code} · ${selectedSubject.name}` : null}
                placeholder="Choose subject"
                icon="book-outline"
                onPress={() => setSheet("subject")}
              />
            )
          )}
          {selectedSubject && (
            <SelectField
              label="Exam attempt"
              value={ATTEMPT_LABELS[attempt]}
              placeholder="Choose attempt"
              icon="repeat-outline"
              onPress={() => setSheet("attempt")}
            />
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
              {selectedSubject && resolvedCredits && rosterLoading && <LoadingSpinner style={{ marginTop: spacing.lg }} />}
              {selectedSubject && resolvedCredits && !rosterLoading && roster.length === 0 && (
                <Text style={styles.emptyNote}>No students found in this class.</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <StudentGradeRow
              item={item}
              currentGrade={draftGrades[item.enrollmentNumber]}
              isSaving={!!saving[item.enrollmentNumber]}
              onSetGrade={handleSetGrade}
            />
          )}
        />
        <SheetPicker
          visible={sheet === "year"}
          title="Batch"
          items={years}
          keyOf={(y) => String(y)}
          labelOf={(y) => yearOfStudyLabel(y)}
          selectedKey={selectedYear !== null ? String(selectedYear) : null}
          onPick={(y) => setSelectedYear(y)}
          onClose={() => setSheet(null)}
        />
        <SheetPicker
          visible={sheet === "class"}
          title="Class"
          items={classOptions}
          keyOf={(c) => `${c.branch}||${c.section ?? ""}`}
          labelOf={(c) => c.label}
          selectedKey={selectedClass ? `${selectedClass.branch}||${selectedClass.section ?? ""}` : null}
          onPick={(c) => {
            setSelectedClass(c);
            setSelectedSpecialization(null);
          }}
          onClose={() => setSheet(null)}
          emptyText="No classes found for this batch."
        />
        <SheetPicker
          visible={sheet === "spec"}
          title="Specialization"
          items={selectedClass ? ["__ALL__", ...selectedClass.specializations] : []}
          keyOf={(x) => x}
          labelOf={(x) => (x === "__ALL__" ? `All of ${selectedClass?.label ?? "class"}` : x)}
          selectedKey={selectedSpecialization}
          onPick={(x) => setSelectedSpecialization(x)}
          onClose={() => setSheet(null)}
        />
        <SheetPicker
          visible={sheet === "sem"}
          title="Semester"
          items={[...SEMESTERS]}
          keyOf={(x) => String(x)}
          labelOf={(x) => `Semester ${x}`}
          selectedKey={semester !== null ? String(semester) : null}
          onPick={(x) => {
            setSemester(x);
            setSelectedSubject(null);
          }}
          onClose={() => setSheet(null)}
        />
        <SheetPicker
          visible={sheet === "subject"}
          title="Subject"
          items={subjects}
          keyOf={(x) => x.code}
          labelOf={(x) => x.name}
          sublabelOf={(x) => `${x.code}${x.credits ? ` · ${x.credits} credits` : ""}`}
          selectedKey={selectedSubject?.code ?? null}
          onPick={(x) => setSelectedSubject(x)}
          onClose={() => setSheet(null)}
          searchable={subjects.length > 6}
        />
        <SheetPicker
          visible={sheet === "attempt"}
          title="Exam attempt"
          items={[...ATTEMPT_TYPES]}
          keyOf={(x) => x}
          labelOf={(x) => ATTEMPT_LABELS[x]}
          selectedKey={attempt}
          onPick={(x) => setAttempt(x)}
          onClose={() => setSheet(null)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pickersArea: { paddingHorizontal: spacing.md },
  prefillNote: { ...typography.caption, color: colors.primary, marginTop: spacing.sm, marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.xs, paddingHorizontal: spacing.md },
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
  listContent: { padding: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  studentRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  studentName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  studentReg: { fontSize: 11, color: colors.textSecondary },
  gradeChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gradeChip: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  gradeChipActive: { backgroundColor: colors.primary },
  gradeChipSpecial: { backgroundColor: colors.dangerBg },
  gradeChipSpecialActive: { backgroundColor: colors.danger },
  gradeChipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  gradeChipTextActive: { color: colors.surface },
});
