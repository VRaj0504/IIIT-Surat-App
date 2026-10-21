import React, { useState, useEffect, useCallback, memo } from "react";
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
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { getClassRoster, RosterStudent } from "../firebase/gradesService";
import { markAttendance, getExistingSession } from "../firebase/attendanceService";
import LoadingSpinner from "../components/LoadingSpinner";
import DateField, { todayIso } from "../components/DateField";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

// A class is a SECTION: 1st-year MNC students sit in "CSE D" with CSE
// students and are marked together. Each branch still gets its own
// session doc (students look their attendance up by their own branch).
type ClassGroup = {
  key: string;
  label: string;
  section: string | null;
  branches: string[];
  mainBranch: string; // for the subject list
  specializations: string[];
};

function groupClasses(options: ClassOption[]): ClassGroup[] {
  const map = new Map<string, ClassGroup>();
  for (const o of options) {
    const key = o.section ?? `branch:${o.branch}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key,
        label: o.section ?? o.branch,
        section: o.section,
        branches: [o.branch],
        mainBranch: o.branch,
        specializations: [...o.specializations],
      });
    } else {
      if (!g.branches.includes(o.branch)) g.branches.push(o.branch);
      o.specializations.forEach((sp) => !g.specializations.includes(sp) && g.specializations.push(sp));
    }
  }
  return Array.from(map.values()).map((g) => {
    // The branch named in the section ("CSE D" → CSE) owns the subject list.
    g.mainBranch = g.branches.find((b) => g.section && new RegExp(`\\b${b}\\b`, "i").test(g.section)) ?? g.branches[0];
    const pg = options.some((o) => o.section === g.section && o.label.startsWith("M.Tech"));
    const others = g.branches.filter((b) => b !== g.mainBranch);
    g.label = `${pg ? "M.Tech " : ""}${g.section && /\b(CSE|ECE|MNC)\b/i.test(g.section) ? g.section : [g.mainBranch, g.section].filter(Boolean).join(" ")}${others.length ? ` + ${others.join(", ")}` : ""}`;
    return g;
  });
}

const isValidDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};

// Receives only this row's own isAbsent boolean, not the whole
// absentSet — same reasoning as GradeEntryScreen.tsx's StudentGradeRow:
// a 50-70 student roster shouldn't re-render in full every time ONE
// student gets toggled present/absent.
const AttendanceRow = memo(function AttendanceRow({
  item,
  isAbsent,
  onToggle,
}: {
  item: RosterStudent;
  isAbsent: boolean;
  onToggle: (enrollmentNumber: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.studentRow, isAbsent && styles.studentRowAbsent]}
      onPress={() => onToggle(item.enrollmentNumber)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentReg}>{item.enrollmentNumber}</Text>
      </View>
      <View style={[styles.statusPill, isAbsent ? styles.statusPillAbsent : styles.statusPillPresent]}>
        <Ionicons name={isAbsent ? "close-circle" : "checkmark-circle"} size={14} color={colors.surface} />
        <Text style={styles.statusPillText}>{isAbsent ? "Absent" : "Present"}</Text>
      </View>
    </TouchableOpacity>
  );
});

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function MarkAttendanceScreen() {
  const { profile } = useAuth();

  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [classOptions, setClassOptions] = useState<ClassGroup[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassGroup | null>(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);

  const [semester, setSemester] = useState<(typeof SEMESTERS)[number] | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<CurriculumSubject | null>(null);

  const [date, setDate] = useState(todayDateString());

  const [roster, setRoster] = useState<(RosterStudent & { branch: string })[]>([]);
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
    // Default to the semester this batch is in now (can still be changed).
    setSemester(getCurrentSemester(selectedYear) as (typeof SEMESTERS)[number]);
    setSelectedSubject(null);
    getClassOptionsForYear(selectedYear)
      .then((opts) => setClassOptions(groupClasses(opts)))
      .catch(() => setClassOptions([]))
      .finally(() => setClassesLoading(false));
  }, [selectedYear]);

  useEffect(() => {
    if (!selectedClass || semester === null) {
      setSubjects([]);
      return;
    }
    const unsubscribe = subscribeToCurriculum(selectedClass.mainBranch, semester, setSubjects);
    return () => unsubscribe();
  }, [selectedClass, semester]);

  useEffect(() => {
    const needsSpecialization = selectedClass && selectedClass.specializations.length > 0;
    if (!selectedClass || selectedYear === null || !selectedSubject || !isValidDate(date) || (needsSpecialization && !selectedSpecialization)) {
      setRoster([]);
      setAbsentSet(new Set());
      return;
    }
    const specFilter = selectedSpecialization === "__ALL__" ? null : selectedSpecialization;
    setRosterLoading(true);
    Promise.all(
      selectedClass.branches.map(async (branch) => {
        const [students, absent] = await Promise.all([
          getClassRoster(selectedYear, branch, selectedClass.section, specFilter),
          getExistingSession({
            branch,
            admissionYear: selectedYear,
            section: selectedClass.section,
            subjectCode: selectedSubject.code,
            date: date.trim(),
          }),
        ]);
        return { students: students.map((st) => ({ ...st, branch })), absent: absent ?? [] };
      }),
    )
      .then((parts) => {
        setRoster(parts.flatMap((p) => p.students).sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber)));
        setAbsentSet(new Set(parts.flatMap((p) => p.absent)));
      })
      .catch(() => {
        setRoster([]);
        setAbsentSet(new Set());
      })
      .finally(() => setRosterLoading(false));
  }, [selectedClass, selectedYear, selectedSubject, selectedSpecialization, date]);

  // useCallback with an empty dep array is safe here — the updater form
  // of setAbsentSet means this never actually closes over absentSet
  // itself, so the reference genuinely never needs to change. That
  // stability is what lets AttendanceRow's memo() below skip
  // re-rendering the other 50-70 rows every time one student is toggled.
  const toggleAbsent = useCallback((enrollmentNumber: string) => {
    setAbsentSet((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentNumber)) next.delete(enrollmentNumber);
      else next.add(enrollmentNumber);
      return next;
    });
  }, []);

  const today = todayDateString();
  const dateError = !isValidDate(date) ? "Use the format YYYY-MM-DD." : date.trim() > today ? "That date is in the future." : "";

  const handleSave = async () => {
    if (!profile || !selectedClass || selectedYear === null || !selectedSubject || dateError) return;
    setSaving(true);
    try {
      const spec = selectedSpecialization && selectedSpecialization !== "__ALL__" ? selectedSpecialization : null;
      for (const branch of selectedClass.branches) {
        const mine = roster.filter((r) => r.branch === branch);
        if (!mine.length) continue;
        await markAttendance({
          branch,
          admissionYear: selectedYear,
          section: selectedClass.section,
          subjectCode: selectedSubject.code,
          subjectName: selectedSubject.name,
          date: date.trim(),
          absentEnrollmentNumbers: mine.filter((r) => absentSet.has(r.enrollmentNumber)).map((r) => r.enrollmentNumber),
          markedBy: profile.uid,
          markedByName: profile.name,
          semester: semester ?? undefined,
          specialization: spec,
        });
      }
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

      <Text style={styles.helperNote}>
        Marked here or on the faculty portal — students see their percentage in the app right away.
      </Text>

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
                  const active = selectedClass?.key === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
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
              <Text style={styles.emptyNote}>No subjects found for {selectedClass.mainBranch} sem {semester}.</Text>
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
            <DateField value={date} onChange={setDate} max={todayIso()} placeholder="Class date" />
            {!!dateError && <Text style={[styles.emptyNote, { color: colors.danger, paddingHorizontal: 0 }]}>{dateError}</Text>}
          </>
        )}
      </View>

      {selectedSubject && !dateError && (
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
    selectedSubject && !dateError && !rosterLoading && roster.length > 0 ? (
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
          data={selectedSubject && !dateError && !rosterLoading ? roster : []}
          keyExtractor={(item) => item.enrollmentNumber}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          renderItem={({ item }) => (
            <AttendanceRow
              item={item}
              isAbsent={absentSet.has(item.enrollmentNumber)}
              onToggle={toggleAbsent}
            />
          )}
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
