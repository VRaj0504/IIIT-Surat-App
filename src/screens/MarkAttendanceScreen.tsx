import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
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
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getAdmissionYears, getClassOptionsForYear, yearOfStudyLabel, ClassOption } from "../firebase/announcementsService";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { getClassRoster, RosterStudent } from "../firebase/gradesService";
import { markAttendance, getExistingSession } from "../firebase/attendanceService";
import LoadingSpinner from "../components/LoadingSpinner";
import DateField, { todayIso } from "../components/DateField";
import { subscribeToFacultyTimetable, FacultyScheduleEntry } from "../firebase/timetableService";
import { mergeContiguousSlots, toMinutes } from "../utils/timetable";
import { RollCallCard } from "../components/attendance/RollCall";
import { rosterForYear } from "../firebase/rosterCache";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type ClassGroup = {
  key: string;
  label: string;
  section: string | null;
  branches: string[];
  mainBranch: string;
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

type Pick = { year: number; branch: string; semester: number; section: string; subjectCode: string };

function admissionYearFor(semester: number): number | null {
  const y = new Date().getFullYear();
  for (let a = y; a >= y - 5; a--) if (getCurrentSemester(a) === semester) return a;
  return null;
}
const normSec = (x: string | null | undefined) => String(x ?? "").replace(/\s+/g, "").toUpperCase();
const normCode = (x: string | null | undefined) => String(x ?? "").replace(/\s+/g, "").toUpperCase();
function clock(m: number) {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function MarkAttendanceScreen() {
  const { profile } = useAuth();
  const [schedule, setSchedule] = useState<FacultyScheduleEntry[]>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [autoPicked, setAutoPicked] = useState(false);

  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [classOptions, setClassOptions] = useState<ClassGroup[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassGroup | null>(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);
  const [optionsYear, setOptionsYear] = useState<number | null>(null);

  const [semester, setSemester] = useState<(typeof SEMESTERS)[number] | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<CurriculumSubject | null>(null);

  const [date, setDate] = useState(todayDateString());

  const [roster, setRoster] = useState<(RosterStudent & { branch: string })[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [absentSet, setAbsentSet] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"roll" | "list">("roll");
  const [phase, setPhase] = useState<"mark" | "review" | "done">("mark");
  const [cursor, setCursor] = useState(0);
  const [marks, setMarks] = useState<Map<string, "P" | "A">>(new Map());
  const [setupOpen, setSetupOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [lecture, setLecture] = useState(1);
  const [savedLectures, setSavedLectures] = useState<number[]>([]);
  const [wasSaved, setWasSaved] = useState(false);

  useEffect(() => {
    getAdmissionYears().then(setYears).catch(() => setYears([]));
  }, []);

  useEffect(() => {
    if (!profile?.name) return;
    return subscribeToFacultyTimetable(profile.name, setSchedule);
  }, [profile?.name]);

  const nowDate = new Date();
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const todayName = nowDate.toLocaleDateString("en-US", { weekday: "long" });
  const todays = mergeContiguousSlots(schedule.filter((e) => e.day === todayName))
    .filter((e) => toMinutes(e.startTime) >= 0)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)) as FacultyScheduleEntry[];
  const prefetchKey = todays.map((e) => e.semester).join(",");
  useEffect(() => {
    new Set(prefetchKey.split(",").filter(Boolean).map((x) => admissionYearFor(Number(x)))).forEach((y) => {
      if (y !== null) rosterForYear(y).catch(() => undefined);
    });
  }, [prefetchKey]);
  const liveOrJustDone = todays.find((e) => toMinutes(e.startTime) <= nowMin && nowMin < toMinutes(e.endTime) + 60) ?? null;

  const applyPick = useCallback((e: FacultyScheduleEntry) => {
    const year = admissionYearFor(e.semester);
    if (year === null) return;
    setPick({ year, branch: e.branch, semester: e.semester, section: e.section, subjectCode: e.subjectCode });
    setDate(todayDateString());
    setSelectedYear(year);
  }, []);

  useEffect(() => {
    if (autoPicked || !liveOrJustDone || selectedYear !== null) return;
    setAutoPicked(true);
    applyPick(liveOrJustDone);
  }, [autoPicked, liveOrJustDone, selectedYear, applyPick]);

  useEffect(() => {
    if (!pick || classesLoading || optionsYear !== pick.year) return;
    const match =
      classOptions.find((c) => normSec(c.section) === normSec(pick.section)) ??
      classOptions.find((c) => !c.section && c.branches.includes(pick.branch)) ??
      classOptions.find((c) => c.mainBranch === pick.branch && normSec(c.section).endsWith(normSec(pick.section).replace(pick.branch.toUpperCase(), ""))) ??
      null;
    if (!match) {
      setPick(null);
      return;
    }
    setSelectedClass(match);
    setSelectedSpecialization(null);
    setSemester(pick.semester as (typeof SEMESTERS)[number]);
  }, [pick, classOptions, classesLoading, optionsYear]);

  useEffect(() => {
    if (!pick || !selectedClass || !subjects.length) return;
    const sub = subjects.find((x) => normCode(x.code) === normCode(pick.subjectCode));
    if (!sub) return;
    setSelectedSubject(sub);
    setPick(null);
  }, [pick, selectedClass, subjects]);

  useEffect(() => {
    if (selectedYear === null) {
      setClassOptions([]);
      return;
    }
    setClassesLoading(true);
    setSelectedClass(null);

    setSemester(getCurrentSemester(selectedYear) as (typeof SEMESTERS)[number]);
    setSelectedSubject(null);
    getClassOptionsForYear(selectedYear)
      .then((opts) => {
        setClassOptions(groupClasses(opts));
        setOptionsYear(selectedYear);
      })
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
    setLecture(1);
    setSavedLectures([]);
  }, [selectedClass, selectedSubject, date]);

  useEffect(() => {
    const needsSpecialization = selectedClass && selectedClass.specializations.length > 0;
    if (!selectedClass || selectedYear === null || !selectedSubject || !isValidDate(date) || (needsSpecialization && !selectedSpecialization)) {
      setRoster([]);
      setAbsentSet(new Set());
      setSetupOpen(true);
      return;
    }
    const specFilter = selectedSpecialization === "__ALL__" ? null : selectedSpecialization;
    let live = true;
    setRosterLoading(true);
    const key = (branch: string, l: number) => ({
      branch,
      admissionYear: selectedYear,
      section: selectedClass.section,
      subjectCode: selectedSubject.code,
      date: date.trim(),
      lecture: l,
    });
    Promise.all(
      selectedClass.branches.map(async (branch) => {
        const [students, l1, l2, other] = await Promise.all([
          getClassRoster(selectedYear, branch, selectedClass.section, specFilter),
          getExistingSession(key(branch, 1)),
          getExistingSession(key(branch, 2)),
          lecture > 2 ? getExistingSession(key(branch, lecture)) : Promise.resolve(null),
        ]);
        const absent = lecture === 1 ? l1 : lecture === 2 ? l2 : other;
        return { students: students.map((st) => ({ ...st, branch })), absent, l1: l1 !== null, l2: l2 !== null };
      }),
    )
      .then((parts) => {
        if (!live) return;
        const list = parts.flatMap((p) => p.students).sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));
        const existing = parts.some((p) => p.absent !== null);
        const abs = new Set(parts.flatMap((p) => p.absent ?? []));
        setRoster(list);
        setAbsentSet(abs);
        setSavedLectures([parts.some((p) => p.l1) ? 1 : 0, parts.some((p) => p.l2) ? 2 : 0].filter(Boolean));
        setWasSaved(existing);
        setSearch("");
        if (existing) {
          setMarks(new Map(list.map((r) => [r.enrollmentNumber, abs.has(r.enrollmentNumber) ? "A" : "P"] as [string, "P" | "A"])));
          setCursor(list.length);
          setMode("list");
          setPhase("review");
        } else {
          setMarks(new Map());
          setCursor(0);
          setMode("roll");
          setPhase("mark");
        }
        if (list.length) setSetupOpen(false);
      })
      .catch(() => {
        if (!live) return;
        setRoster([]);
        setAbsentSet(new Set());
      })
      .finally(() => live && setRosterLoading(false));
    return () => {
      live = false;
    };
  }, [selectedClass, selectedYear, selectedSubject, selectedSpecialization, date, lecture]);

  const toggleAbsent = useCallback((enrollmentNumber: string) => {
    setAbsentSet((prev) => {
      const next = new Set(prev);
      const nowAbsent = !next.has(enrollmentNumber);
      if (nowAbsent) next.add(enrollmentNumber);
      else next.delete(enrollmentNumber);
      setMarks((m) => new Map(m).set(enrollmentNumber, nowAbsent ? "A" : "P"));
      return next;
    });
    setPhase((p) => (p === "done" ? "review" : p));
  }, []);

  const markOne = useCallback(
    (reg: string, m: "P" | "A") => {
      setMarks((prev) => new Map(prev).set(reg, m));
      setAbsentSet((prev) => {
        const next = new Set(prev);
        if (m === "A") next.add(reg);
        else next.delete(reg);
        return next;
      });
      const n = cursor + 1;
      setCursor(n);
      if (n >= roster.length) setPhase("review");
    },
    [cursor, roster.length],
  );

  const undo = useCallback(() => {
    const n = Math.max(0, cursor - 1);
    const reg = roster[n]?.enrollmentNumber;
    if (reg) {
      setMarks((prev) => {
        const next = new Map(prev);
        next.delete(reg);
        return next;
      });
      setAbsentSet((prev) => {
        const next = new Set(prev);
        next.delete(reg);
        return next;
      });
    }
    setCursor(n);
    setPhase("mark");
  }, [cursor, roster]);

  const restPresent = useCallback(() => {
    setMarks((prev) => {
      const next = new Map(prev);
      roster.forEach((r) => !next.has(r.enrollmentNumber) && next.set(r.enrollmentNumber, "P"));
      return next;
    });
    setCursor(roster.length);
    setPhase("review");
  }, [roster]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.name.toLowerCase().includes(q) || r.enrollmentNumber.toLowerCase().includes(q) || r.enrollmentNumber.slice(-3) === q.padStart(3, "0"));
  }, [roster, search]);

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
          lecture,
          classSize: mine.length,
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
      setWasSaved(true);
      setSavedLectures((l) => (l.includes(lecture) ? l : [...l, lecture].sort()));
      setPhase("done");
    } catch (err: any) {
      Alert.alert("Couldn't save", err.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const ListHeader = (
    <View>

      {setupOpen && (
        <Text style={styles.helperNote}>
          Marked here or on the faculty portal — students see their percentage in the app right away.
        </Text>
      )}

      {setupOpen && todays.length > 0 && (
        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Your classes today</Text>
          <Text style={styles.quickSub}>Tap one to fill in the class, subject and date.</Text>
          <View style={styles.quickList}>
            {todays.map((e, i) => {
              const a = toMinutes(e.startTime);
              const b = toMinutes(e.endTime);
              const live = a <= nowMin && nowMin < b;
              const done = b <= nowMin;
              const active =
                !!selectedSubject &&
                !!selectedClass &&
                semester === e.semester &&
                normCode(selectedSubject.code) === normCode(e.subjectCode) &&
                normSec(selectedClass.section ?? selectedClass.mainBranch) === normSec(e.section);
              return (
                <TouchableOpacity
                  key={`${e.id}-${i}`}
                  style={[styles.quickRow, active && styles.quickRowActive]}
                  onPress={() => applyPick(e)}
                  disabled={a > nowMin}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${e.subjectName} for ${e.branch} semester ${e.semester} ${e.section}`}
                >
                  <Text style={[styles.quickTime, active && { color: colors.onPrimary }]}>{clock(a)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quickSubject, active && { color: colors.onPrimary }]} numberOfLines={1}>
                      {e.subjectName || e.subjectCode}
                    </Text>
                    <Text style={[styles.quickMeta, active && { color: colors.heroMuted }]} numberOfLines={1}>
                      {[e.branch, `Sem ${e.semester}`, e.section !== e.branch ? e.section : null, e.room].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.quickTag,
                      live ? styles.quickTagLive : done ? styles.quickTagDone : styles.quickTagLater,
                      active && { color: colors.onPrimary },
                    ]}
                  >
                    {live ? "NOW" : done ? "MARK" : "LATER"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {!setupOpen && selectedClass && selectedSubject ? (
        <View style={styles.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle} numberOfLines={1}>{selectedSubject.name}</Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {[selectedClass.label, semester ? `Sem ${semester}` : null, date === today ? "Today" : date, `${roster.length} students`].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <TouchableOpacity style={styles.changeBtn} onPress={() => setSetupOpen(true)}>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <View style={styles.pickersArea}>
        <Text style={styles.label}>{todays.length ? "Or pick any class" : "Year (batch)"}</Text>
        {years.length === 0 ? <Text style={[styles.emptyNote, { paddingHorizontal: 0 }]}>Loading batches…</Text> : null}
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
        {roster.length > 0 && selectedSubject && (
          <TouchableOpacity style={[styles.saveButton, { marginTop: spacing.md }]} onPress={() => setSetupOpen(false)}>
            <Text style={styles.saveButtonText}>Start taking attendance</Text>
          </TouchableOpacity>
        )}
      </View>
      )}

      {selectedSubject && !dateError && !setupOpen && (
        <View style={{ paddingHorizontal: spacing.lg }}>
          {rosterLoading && <LoadingSpinner style={{ marginTop: spacing.lg }} />}
          {!rosterLoading && roster.length === 0 && <Text style={styles.emptyNote}>No students found in this class.</Text>}
          {!rosterLoading && roster.length > 0 && (
            <>
              {(savedLectures.length > 0 || lecture > 1) && (
                <View style={[styles.chipRow, { marginTop: spacing.md }]}>
                  {[1, 2].map((l) => (
                    <TouchableOpacity key={l} style={[styles.chip, lecture === l && styles.chipActive]} onPress={() => setLecture(l)}>
                      <Text style={[styles.chipText, lecture === l && styles.chipTextActive]}>
                        {l === 1 ? "1st class" : "2nd class"}
                        {savedLectures.includes(l) ? " · saved" : " · new"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {wasSaved && phase !== "done" && (
                <Text style={[styles.helperNote, { paddingHorizontal: 0 }]}>
                  Already saved for this date. Change anyone below and save again to update it.
                </Text>
              )}

              {phase !== "done" && (
                <View style={styles.segment}>
                  {(["roll", "list"] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.segBtn, mode === m && styles.segBtnOn]}
                      onPress={() => {
                        setMode(m);
                        if (m === "roll" && cursor >= roster.length) setPhase("review");
                      }}
                    >
                      <Ionicons name={m === "roll" ? "person-outline" : "list-outline"} size={15} color={mode === m ? colors.onPrimary : colors.textSecondary} />
                      <Text style={[styles.segText, mode === m && styles.segTextOn]}>{m === "roll" ? "One by one" : "Full list"}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {phase === "done" ? (
                <View style={styles.doneCard}>
                  <View style={styles.doneIcon}>
                    <Ionicons name="checkmark" size={34} color={colors.onPrimary} />
                  </View>
                  <Text style={styles.doneTitle}>Attendance saved</Text>
                  <Text style={styles.doneMeta}>
                    {roster.length - absentSet.size} present · {absentSet.size} absent
                    {lecture > 1 ? ` · 2nd class` : ""}
                  </Text>
                  <Text style={styles.doneSync}>Students see it now, and it's already in the register on the faculty portal.</Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, alignSelf: "stretch" }}>
                    <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => { setPhase("review"); setMode("list"); }}>
                      <Text style={styles.secondaryText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveButton, { flex: 1.4, marginTop: 0 }]}
                      onPress={() => {
                        setSelectedSubject(null);
                        setSetupOpen(true);
                        setPhase("mark");
                      }}
                    >
                      <Text style={styles.saveButtonText}>Next class</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : mode === "roll" && phase === "mark" ? (
                <RollCallCard students={roster} index={Math.min(cursor, roster.length - 1)} marks={marks} absentCount={absentSet.size} onMark={markOne} onUndo={undo} onRestPresent={restPresent} />
              ) : mode === "roll" ? (
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewTitle}>Check before saving</Text>
                  <View style={styles.countRow}>
                    <View style={[styles.countBox, { backgroundColor: colors.success + "14" }]}>
                      <Text style={[styles.countNum, { color: colors.success }]}>{roster.length - absentSet.size}</Text>
                      <Text style={styles.countLbl}>Present</Text>
                    </View>
                    <View style={[styles.countBox, { backgroundColor: colors.danger + "14" }]}>
                      <Text style={[styles.countNum, { color: colors.danger }]}>{absentSet.size}</Text>
                      <Text style={styles.countLbl}>Absent</Text>
                    </View>
                  </View>
                  {absentSet.size > 0 ? (
                    <>
                      <Text style={styles.label}>Absent — tap to change to present</Text>
                      <View style={styles.chipRow}>
                        {roster
                          .filter((r) => absentSet.has(r.enrollmentNumber))
                          .map((r) => (
                            <TouchableOpacity key={r.enrollmentNumber} style={styles.absChip} onPress={() => toggleAbsent(r.enrollmentNumber)}>
                              <Text style={styles.absChipText}>{r.name.split(" ")[0]} · {r.enrollmentNumber.slice(-3)}</Text>
                              <Ionicons name="close" size={14} color={colors.danger} />
                            </TouchableOpacity>
                          ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.helperNote}>Everyone is present.</Text>
                  )}
                  <TouchableOpacity style={{ marginTop: spacing.md }} onPress={() => { setCursor(0); setMarks(new Map()); setAbsentSet(new Set()); setPhase("mark"); }}>
                    <Text style={styles.linkText}>Start roll call again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Find by name or roll no. (e.g. 114)"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.helperNote, { paddingHorizontal: 0 }]}>Everyone starts present. Tap a name to mark absent.</Text>
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );

  const canSave = selectedSubject && !dateError && !setupOpen && !rosterLoading && roster.length > 0 && phase !== "done" && (mode === "list" || phase === "review");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <FlatList
          data={selectedSubject && !dateError && !setupOpen && !rosterLoading && mode === "list" && phase !== "done" ? shown : []}
          keyExtractor={(item) => item.enrollmentNumber}
          contentContainerStyle={[styles.listContent, canSave && { paddingBottom: 110 }]}
          ListHeaderComponent={ListHeader}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <AttendanceRow item={item} isAbsent={absentSet.has(item.enrollmentNumber)} onToggle={toggleAbsent} />
            </View>
          )}
        />
        {canSave ? (
          <View style={styles.saveBar}>
            <TouchableOpacity style={[styles.saveButton, { marginTop: 0 }]} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {wasSaved ? "Update" : "Save"} — {roster.length - absentSet.size} present, {absentSet.size} absent
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  pickersArea: { paddingHorizontal: spacing.lg },
  quickCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, borderWidth: 1.5, borderColor: colors.border },
  quickTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  quickSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  quickList: { marginTop: spacing.sm, gap: 6 },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  quickRowActive: { backgroundColor: colors.primary },
  quickTime: { width: 70, fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  quickSubject: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  quickMeta: { fontSize: 12, color: colors.textSecondary },
  quickTag: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  quickTagLive: { color: colors.success },
  quickTagDone: { color: colors.primary },
  quickTagLater: { color: colors.textSecondary },
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
  listContent: { paddingBottom: spacing.xl, gap: spacing.sm },
  summaryCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.primary },
  summaryTitle: { fontSize: 16, fontWeight: "800", color: colors.onPrimary },
  summaryMeta: { fontSize: 12, color: colors.heroMuted, marginTop: 2 },
  changeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.18)" },
  changeText: { color: colors.onPrimary, fontWeight: "700", fontSize: 13 },
  segment: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.full, padding: 4, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.full },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  segTextOn: { color: colors.onPrimary },
  reviewCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1.5, borderColor: colors.border },
  reviewTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  countRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  countBox: { flex: 1, borderRadius: 18, paddingVertical: spacing.md, alignItems: "center" },
  countNum: { fontSize: 30, fontWeight: "900" },
  countLbl: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  absChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.danger + "14", borderWidth: 1, borderColor: colors.danger + "40" },
  absChipText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  linkText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  saveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.gradientEnd },
  doneCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, alignItems: "center", borderWidth: 1.5, borderColor: colors.border },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  doneTitle: { marginTop: spacing.md, fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  doneMeta: { marginTop: 4, fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  doneSync: { marginTop: spacing.sm, fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  secondaryBtn: { borderRadius: radius.full, paddingVertical: spacing.md, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontWeight: "700", fontSize: 15, color: colors.textPrimary },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
