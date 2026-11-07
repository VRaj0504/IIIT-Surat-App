import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
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
import { markAttendance, getSessionMeta, getClassAttendanceSummary, ClassStanding, ATTENDANCE_TARGET } from "../firebase/attendanceService";
import LoadingSpinner from "../components/LoadingSpinner";
import DateField, { todayIso } from "../components/DateField";
import { SelectField, SheetPicker, FieldLabel } from "../components/ui";
import { subscribeToFacultyTimetable, FacultyScheduleEntry } from "../firebase/timetableService";
import { mergeContiguousSlots, toMinutes } from "../utils/timetable";
import { RollCallCard } from "../components/attendance/RollCall";
import { excusalCovers, getApprovedExcusalsOn, rangeFor } from "../firebase/eventExcusalService";
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
  onDuty,
}: {
  item: RosterStudent;
  isAbsent: boolean;
  onToggle: (enrollmentNumber: string) => void;
  onDuty?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.studentRow, isAbsent && styles.studentRowAbsent, pressed && { opacity: 0.7 }]}
      onPress={() => onToggle(item.enrollmentNumber)}
    >
      <View style={[styles.rollBadge, isAbsent && styles.rollBadgeAbsent]}>
        <Text style={[styles.rollBadgeText, isAbsent && { color: colors.danger }]}>{item.enrollmentNumber.slice(-3)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.studentReg}>{item.enrollmentNumber}</Text>
        {onDuty ? (
          <Text style={styles.dutyTag} numberOfLines={1}>
            On event duty · {onDuty}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, isAbsent ? styles.statusPillAbsent : styles.statusPillPresent]}>
        <Text style={styles.statusPillText}>{isAbsent ? "Absent" : "Present"}</Text>
      </View>
    </Pressable>
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
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [sheet, setSheet] = useState<null | "year" | "class" | "spec" | "sem" | "subject">(null);
  const [standing, setStanding] = useState<ClassStanding[] | null>(null);
  const [lowOpen, setLowOpen] = useState(false);
  const [rosterStatus, setRosterStatus] = useState<"idle" | "loading" | "ready" | "error" | "needsSpec">("idle");
  const [retry, setRetry] = useState(0);
  const [lecture, setLecture] = useState(1);
  const [savedLectures, setSavedLectures] = useState<number[]>([]);
  const [takenLectures, setTakenLectures] = useState<Record<number, string>>({});
  const [takenNote, setTakenNote] = useState("");
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
  const todays = useMemo(
    () =>
      mergeContiguousSlots(schedule.filter((e) => e.day === todayName))
        .filter((e) => toMinutes(e.startTime) >= 0)
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)) as FacultyScheduleEntry[],
    [schedule, todayName],
  );
  const prefetchKey = todays.map((e) => e.semester).join(",");
  useEffect(() => {
    new Set(prefetchKey.split(",").filter(Boolean).map((x) => admissionYearFor(Number(x)))).forEach((y) => {
      if (y !== null) rosterForYear(y).catch(() => undefined);
    });
  }, [prefetchKey]);

  const applyPick = useCallback((e: FacultyScheduleEntry) => {
    const year = admissionYearFor(e.semester);
    if (year === null) return;
    setPick({ year, branch: e.branch, semester: e.semester, section: e.section, subjectCode: e.subjectCode });
    setDate(todayDateString());
    setSelectedYear(year);
  }, []);

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
      setRosterStatus(needsSpecialization && selectedSubject ? "needsSpec" : "idle");
      return;
    }
    const specFilter = selectedSpecialization === "__ALL__" ? null : selectedSpecialization;
    let live = true;
    setRosterLoading(true);
    setRosterStatus("loading");
    const key = (branch: string, l: number) => ({
      branch,
      admissionYear: selectedYear,
      section: selectedClass.section,
      subjectCode: selectedSubject.code,
      date: date.trim(),
      lecture: l,
    });
    const me = profile?.uid;
    const isAdm = !!profile?.isAdmin;
    const lects = Array.from(new Set([1, 2, 3, lecture]));
    Promise.all(
      selectedClass.branches.map(async (branch) => {
        const [students, ...metas] = await Promise.all([
          getClassRoster(selectedYear, branch, selectedClass.section, specFilter),
          ...lects.map((l) => getSessionMeta(key(branch, l))),
        ]);
        const byLect = new Map(lects.map((l, i) => [l, metas[i]] as const));
        return { students: students.map((st) => ({ ...st, branch })), byLect };
      }),
    )
      .then((parts) => {
        if (!live) return;
        const mine = (m: { markedBy: string | null }) => !m.markedBy || m.markedBy === me || isAdm;
        const ownerAt = (l: number): string | null => {
          for (const p of parts) {
            const m = p.byLect.get(l);
            if (m && !mine(m)) return m.markedByName ?? "another teacher";
          }
          return null;
        };
        const taken: Record<number, string> = {};
        [1, 2, 3].forEach((l) => {
          const o = ownerAt(l);
          if (o) taken[l] = o;
        });
        setTakenLectures(taken);
        const owner = ownerAt(lecture);
        if (owner) {
          let next = 1;
          while (next <= 3 && ownerAt(next)) next++;
          setTakenNote(`${owner} already marked class ${lecture} on this date. Showing class ${next}.`);
          setLecture(next);
          return;
        }
        setTakenNote("");
        const list = parts.flatMap((p) => p.students).sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));
        const absentParts = parts.map((p) => p.byLect.get(lecture)?.absent ?? null);
        const existing = absentParts.some((a) => a !== null);
        const abs = new Set(absentParts.flatMap((a) => a ?? []));
        setRoster(list);
        setAbsentSet(abs);
        setSavedLectures([1, 2, 3].filter((l) => parts.some((p) => p.byLect.get(l))));
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
        setRosterStatus("ready");
      })
      .catch((err) => {
        if (!live) return;
        console.warn("[MarkAttendance] class list failed", err);
        setRoster([]);
        setAbsentSet(new Set());
        setRosterStatus("error");
      })
      .finally(() => live && setRosterLoading(false));
    return () => {
      live = false;
    };
  }, [selectedClass, selectedYear, selectedSubject, selectedSpecialization, date, lecture, retry]);

  const toggleAbsent = useCallback((enrollmentNumber: string) => {
    setAbsentSet((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentNumber)) next.delete(enrollmentNumber);
      else next.add(enrollmentNumber);
      return next;
    });
    setMarks((m) => new Map(m).set(enrollmentNumber, m.get(enrollmentNumber) === "A" ? "P" : "A"));
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
    const base = onlyAbsent ? roster.filter((r) => absentSet.has(r.enrollmentNumber)) : roster;
    if (!q) return base;
    return base.filter((r) => r.name.toLowerCase().includes(q) || r.enrollmentNumber.toLowerCase().includes(q) || r.enrollmentNumber.slice(-3) === q.padStart(3, "0"));
  }, [roster, search, onlyAbsent, absentSet]);

  const today = todayDateString();
  const dateError = !isValidDate(date) ? "Use the format YYYY-MM-DD." : date.trim() > today ? "That date is in the future." : "";

  const standingKey =
    !setupOpen && selectedClass && selectedYear !== null && selectedSubject && roster.length
      ? `${selectedClass.key}|${selectedYear}|${selectedSubject.code}|${selectedSpecialization ?? ""}|${roster.length}|${wasSaved}`
      : "";
  useEffect(() => {
    if (!standingKey || !selectedClass || selectedYear === null || !selectedSubject) {
      setStanding(null);
      return;
    }
    let live = true;
    const spec = selectedSpecialization && selectedSpecialization !== "__ALL__" ? selectedSpecialization : null;
    Promise.all(
      selectedClass.branches.map((branch) =>
        getClassAttendanceSummary({
          branch,
          admissionYear: selectedYear,
          section: selectedClass.section,
          subjectCode: selectedSubject.code,
          specialization: spec,
          enrollmentNumbers: roster.filter((r) => r.branch === branch).map((r) => r.enrollmentNumber),
        }),
      ),
    )
      .then((parts) => live && setStanding(parts.flat().sort((a, b) => a.percentage - b.percentage)))
      .catch(() => live && setStanding(null));
    return () => {
      live = false;
    };
  }, [standingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lowStudents = (standing ?? []).filter((s) => s.percentage < ATTENDANCE_TARGET);
  const nameOf = (reg: string) => roster.find((r) => r.enrollmentNumber === reg)?.name ?? reg;

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

  // Students on an approved event excusal for this class: they can be marked absent and it still counts as attended.
  const [onDuty, setOnDuty] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const code = selectedSubject?.code;
    if (!code || roster.length === 0 || !isValidDate(date)) {
      setOnDuty(new Map());
      return;
    }
    let alive = true;
    getApprovedExcusalsOn(date)
      .then((list) => {
        if (!alive) return;
        const m = new Map<string, string>();
        const regs = new Set(roster.map((r) => r.enrollmentNumber));
        list.forEach((x) =>
          x.studentEnrollmentNumbers.forEach((reg) => {
            if (regs.has(reg) && !m.has(reg) && excusalCovers(rangeFor(x, reg), date, code)) m.set(reg, x.eventName);
          }),
        );
        setOnDuty(m);
      })
      .catch(() => alive && setOnDuty(new Map()));
    return () => {
      alive = false;
    };
  }, [selectedSubject?.code, roster, date]);

  const renderRow = useCallback(
    ({ item }: { item: RosterStudent & { branch: string } }) => (
      <AttendanceRow item={item} isAbsent={absentSet.has(item.enrollmentNumber)} onToggle={toggleAbsent} onDuty={onDuty.get(item.enrollmentNumber)} />
    ),
    [absentSet, toggleAbsent, onDuty],
  );

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
      ) : null}
      {!setupOpen && selectedClass && selectedSubject && standing && standing.length > 0 ? (
        <TouchableOpacity style={[styles.lowLine, !lowStudents.length && styles.lowLineOk]} onPress={() => lowStudents.length && setLowOpen(true)} activeOpacity={0.8}>
          <Ionicons name={lowStudents.length ? "warning-outline" : "checkmark-circle-outline"} size={16} color={lowStudents.length ? colors.danger : colors.success} />
          <Text style={[styles.lowText, { color: lowStudents.length ? colors.danger : colors.success }]}>
            {lowStudents.length
              ? `Below ${ATTENDANCE_TARGET}% in this subject: ${lowStudents.length} student${lowStudents.length > 1 ? "s" : ""}`
              : `Everyone is at ${ATTENDANCE_TARGET}% or above in this subject`}
          </Text>
          {lowStudents.length > 0 && <Ionicons name="chevron-forward" size={16} color={colors.danger} />}
        </TouchableOpacity>
      ) : null}
      {!setupOpen && selectedClass && selectedSubject ? null : (
      <View style={styles.pickersArea}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{todays.length ? "Or pick any class" : "Pick the class"}</Text>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <SelectField
                label="Batch"
                value={selectedYear !== null ? yearOfStudyLabel(selectedYear).replace(/\s*\(\d{4}\)/, "") : null}
                placeholder={years.length ? "Choose" : "Loading…"}
                onPress={() => setSheet("year")}
                disabled={!years.length}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField
                label="Class"
                value={selectedClass?.label}
                placeholder={classesLoading ? "Loading…" : "Choose"}
                onPress={() => setSheet("class")}
                disabled={selectedYear === null || classesLoading}
              />
            </View>
          </View>
          {selectedClass && selectedClass.specializations.length > 0 && (
            <SelectField
              label="Specialization"
              value={selectedSpecialization === "__ALL__" ? `All of ${selectedClass.label}` : selectedSpecialization}
              placeholder="Choose"
              onPress={() => setSheet("spec")}
            />
          )}
          <View style={styles.formRow}>
            <View style={{ flex: 0.7 }}>
              <SelectField
                label="Semester"
                value={semester !== null ? `Sem ${semester}` : null}
                placeholder="Choose"
                onPress={() => setSheet("sem")}
                disabled={!selectedClass}
              />
            </View>
            <View style={{ flex: 1, marginBottom: spacing.md }}>
              <FieldLabel>Date</FieldLabel>
              <DateField value={date} onChange={setDate} max={todayIso()} placeholder="Class date" />
            </View>
          </View>
          <SelectField
            label="Subject"
            value={selectedSubject?.name}
            placeholder={selectedClass && semester !== null && subjects.length === 0 ? "No subjects for this semester" : "Choose"}
            icon="book-outline"
            onPress={() => setSheet("subject")}
            disabled={!selectedClass || semester === null || subjects.length === 0}
          />
          {!!dateError && <Text style={[styles.emptyNote, { color: colors.danger, paddingHorizontal: 0 }]}>{dateError}</Text>}
          {selectedSubject && !dateError && rosterLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading the class list…</Text>
            </View>
          )}
          {rosterStatus === "needsSpec" && (
            <Text style={[styles.emptyNote, { paddingHorizontal: 0 }]}>Pick a specialization to load the class list.</Text>
          )}
          {rosterStatus === "error" && (
            <View style={styles.loadingRow}>
              <Text style={[styles.loadingText, { color: colors.danger, flex: 1 }]}>Couldn't load the class list. Check your internet.</Text>
              <TouchableOpacity onPress={() => setRetry((n) => n + 1)} hitSlop={8}>
                <Text style={styles.linkText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          {rosterStatus === "ready" && roster.length === 0 && selectedClass && selectedYear !== null && (
            <Text style={[styles.emptyNote, { paddingHorizontal: 0 }]}>
              No students in {selectedClass.label} for the {selectedYear} batch. Check that this class is in the student list on the faculty portal.
            </Text>
          )}
        </View>
      </View>
      )}

      {selectedSubject && !dateError && !setupOpen && (
        <View style={{ paddingHorizontal: spacing.md }}>
          {rosterLoading && <LoadingSpinner style={{ marginTop: spacing.lg }} />}
          {!rosterLoading && roster.length === 0 && <Text style={styles.emptyNote}>No students found in this class.</Text>}
          {!rosterLoading && roster.length > 0 && (
            <>
              {(savedLectures.length > 0 || lecture > 1 || Object.keys(takenLectures).length > 0) && (
                <View style={[styles.chipRow, { marginTop: spacing.md }]}>
                  {[1, 2, 3].map((l) => (
                    <TouchableOpacity
                      key={l}
                      style={[styles.chip, lecture === l && styles.chipActive, takenLectures[l] ? { opacity: 0.5 } : null]}
                      disabled={!!takenLectures[l]}
                      onPress={() => setLecture(l)}
                    >
                      <Text style={[styles.chipText, lecture === l && styles.chipTextActive]}>
                        {l === 1 ? "1st class" : l === 2 ? "2nd class" : "3rd class"}
                        {takenLectures[l] ? ` · ${takenLectures[l].split(" ")[0]}` : savedLectures.includes(l) ? " · saved" : " · new"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!takenNote && <Text style={[styles.helperNote, { paddingHorizontal: 0 }]}>{takenNote}</Text>}
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
                  {absentSet.size > 0 && (
                    <Text style={styles.doneAbsent}>
                      Absent: {roster.filter((r) => absentSet.has(r.enrollmentNumber)).map((r) => r.enrollmentNumber.slice(-3)).join(", ")}
                    </Text>
                  )}
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
                <RollCallCard students={roster} index={Math.min(cursor, roster.length - 1)} marks={marks} absentCount={absentSet.size} onMark={markOne} onUndo={undo} onRestPresent={restPresent} onDuty={onDuty} />
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
                  <View style={styles.listTools}>
                    <Text style={[styles.helperNote, { paddingHorizontal: 0, marginTop: 0, flex: 1 }]}>
                      Everyone starts present. Tap a name to mark absent.
                    </Text>
                    <Pressable style={[styles.filterChip, onlyAbsent && styles.filterChipOn]} onPress={() => setOnlyAbsent((v) => !v)}>
                      <Text style={[styles.filterChipText, onlyAbsent && { color: colors.onPrimary }]}>Absent ({absentSet.size})</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );

  const canSave = selectedSubject && !dateError && !setupOpen && !rosterLoading && roster.length > 0 && phase !== "done" && (mode === "list" || phase === "review");
  const canStart = setupOpen && !!selectedSubject && !dateError && !rosterLoading && roster.length > 0;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <FlatList
          data={selectedSubject && !dateError && !setupOpen && !rosterLoading && mode === "list" && phase !== "done" ? shown : []}
          keyExtractor={(item) => item.enrollmentNumber}
          contentContainerStyle={[styles.listContent, (canSave || canStart) && { paddingBottom: 110 }]}
          ListHeaderComponent={ListHeader}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={renderRow}
          keyboardDismissMode="on-drag"
        />
        {canStart ? (
          <View style={styles.saveBar}>
            <TouchableOpacity style={[styles.saveButton, styles.startButton]} onPress={() => setSetupOpen(false)}>
              <Text style={styles.saveButtonText}>Start attendance · {roster.length} students</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.surface} />
            </TouchableOpacity>
          </View>
        ) : null}
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
        <Modal visible={lowOpen} transparent animationType="slide" onRequestClose={() => setLowOpen(false)}>
          <Pressable style={styles.lowBackdrop} onPress={() => setLowOpen(false)}>
            <Pressable style={styles.lowSheet} onPress={() => undefined}>
              <Text style={styles.lowSheetTitle}>Below {ATTENDANCE_TARGET}% in {selectedSubject?.name}</Text>
              <Text style={styles.lowSheetSub}>Counts every class marked for this subject, with approved event and medical excusals counted as attended.</Text>
              <FlatList
                data={lowStudents}
                keyExtractor={(s) => s.enrollmentNumber}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <View style={styles.lowRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName} numberOfLines={1}>{nameOf(item.enrollmentNumber)}</Text>
                      <Text style={styles.studentReg}>{item.enrollmentNumber} · {item.present}/{item.total}</Text>
                    </View>
                    <Text style={[styles.lowPct, { color: colors.danger }]}>{item.percentage}%</Text>
                  </View>
                )}
              />
              <TouchableOpacity style={[styles.secondaryBtn, { marginTop: spacing.md }]} onPress={() => setLowOpen(false)}>
                <Text style={styles.secondaryText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
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
          keyOf={(c) => c.key}
          labelOf={(c) => c.label}
          selectedKey={selectedClass?.key ?? null}
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
          labelOf={(x) => (x === "__ALL__" ? `All of ${selectedClass?.label ?? "the class"}` : x)}
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
          sublabelOf={(x) => x.code}
          selectedKey={selectedSubject?.code ?? null}
          onPick={(x) => setSelectedSubject(x)}
          onClose={() => setSheet(null)}
          searchable={subjects.length > 6}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  lowLine: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.md, marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.dangerBg },
  lowLineOk: { backgroundColor: colors.successBg },
  lowText: { flex: 1, fontSize: 13, fontWeight: "700" },
  lowBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  lowSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl },
  lowSheetTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  lowSheetSub: { fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm, lineHeight: 17 },
  lowRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  lowPct: { fontSize: 15, fontWeight: "800" },
  doneAbsent: { fontSize: 13, fontWeight: "700", color: colors.danger, textAlign: "center", marginTop: 6 },
  formCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, paddingBottom: spacing.xs, borderWidth: 1.5, borderColor: colors.border },
  formTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  formRow: { flexDirection: "row", gap: spacing.sm },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  startButton: { marginTop: 0, flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pickersArea: { paddingHorizontal: spacing.md },
  quickCard: { marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, borderWidth: 1.5, borderColor: colors.border },
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
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.xs, paddingHorizontal: spacing.md },
  helperNote: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.md, marginTop: spacing.sm },
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
  summaryCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.primary },
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
  saveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.gradientEnd },
  doneCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, alignItems: "center", borderWidth: 1.5, borderColor: colors.border },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  doneTitle: { marginTop: spacing.md, fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  doneMeta: { marginTop: 4, fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  doneSync: { marginTop: spacing.sm, fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  secondaryBtn: { borderRadius: radius.full, paddingVertical: spacing.md, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontWeight: "700", fontSize: 15, color: colors.textPrimary },
  listTools: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  dutyTag: { fontSize: 11.5, fontWeight: "800", color: colors.tile.lilac.fg, marginTop: 2 },
  rollBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  rollBadgeAbsent: { backgroundColor: colors.danger + "20" },
  rollBadgeText: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
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
    minWidth: 68,
    justifyContent: "center",
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
