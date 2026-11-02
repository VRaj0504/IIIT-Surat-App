import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { subscribeToMyLeaveApplications, excusedSessionSet, LeaveApplication } from "../firebase/leaveService";
import { getMyAttendance, SubjectAttendance } from "../firebase/attendanceService";
import { subscribeToTimetable, Timetable } from "../firebase/timetableService";
import { subscribeToHolidayOverrides } from "../firebase/holidayOverridesService";
import { getHolidayName } from "../utils/dayStatus";
import { addDays, classesBetween, isoOf, project, untracked, TARGET } from "../utils/leavePlan";
import DateField from "../components/DateField";
import LoadingSpinner from "../components/LoadingSpinner";
import PlusGate from "../components/PlusGate";

const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

const tone = (p: number | null) =>
  p === null
    ? { fg: colors.textSecondary, bg: colors.background }
    : p >= TARGET + 5
      ? { fg: colors.success, bg: colors.successBg }
      : p >= TARGET
        ? { fg: "#B45309", bg: "#FEF3C7" }
        : { fg: colors.danger, bg: colors.dangerBg };

function Planner() {
  const { profile } = useAuth();
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const ready = !!(profile?.enrollmentNumber && profile.branch && profile.admissionYear && semester);
  const today = isoOf(new Date());

  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveApplication[] | null>(null);
  const [rows, setRows] = useState<SubjectAttendance[] | null>(null);
  const [tt, setTt] = useState<Timetable | null | undefined>(undefined);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 1));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    const unsub = subscribeToCurriculum(profile!.branch!, semester!, setSubjects);
    const t = setTimeout(() => setSubjects((s) => s ?? []), 6000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [ready, profile?.branch, semester]);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeToMyLeaveApplications(profile.uid, setLeaves);
  }, [profile?.uid]);

  useEffect(() => {
    if (!ready || !profile?.section) {
      setTt(null);
      return;
    }
    return subscribeToTimetable(profile.branch!, semester!, profile.section, setTt);
  }, [ready, profile?.branch, profile?.section, semester]);

  useEffect(() => subscribeToHolidayOverrides(setHolidays), []);

  const excused = useMemo(() => excusedSessionSet(leaves ?? []), [leaves]);

  useEffect(() => {
    if (!ready || subjects === null || leaves === null) return;
    getMyAttendance({
      enrollmentNumber: profile!.enrollmentNumber!,
      branch: profile!.branch!,
      admissionYear: profile!.admissionYear!,
      section: profile!.section ?? null,
      specialization: profile!.specialization ?? null,
      semester: semester!,
      subjects,
      medicalExcusedSessions: excused,
    })
      .then(setRows)
      .catch((e) => {
        setError(e?.message ?? "Couldn't load attendance.");
        setRows([]);
      });
  }, [ready, subjects, leaves, excused, profile, semester]);

  useEffect(() => {
    if (to < from) setTo(from);
  }, [from, to]);

  const result = useMemo(() => {
    if (!rows || !tt) return null;
    const isHoliday = (iso: string) => !!getHolidayName(iso, holidays);
    const before = classesBetween(tt.days, addDays(today, 1), addDays(from, -1), isHoliday);
    const during = classesBetween(tt.days, from, to, isHoliday);
    const list = project(rows, before.counts, during.counts).sort(
      (a, b) => (a.afterPct ?? 101) - (b.afterPct ?? 101) || a.code.localeCompare(b.code),
    );
    const missedTotal = Array.from(during.counts.values()).reduce((s, n) => s + n, 0);
    const extra = untracked(rows, during.counts).map((c) => ({ code: c, name: during.names.get(c) ?? "", n: during.counts.get(c) ?? 0 }));
    return { list, missedTotal, days: during.dates, extra };
  }, [rows, tt, holidays, from, to, today]);

  if (!ready) {
    return (
      <View style={[styles.page, styles.center]}>
        <Text style={styles.emptyTitle}>Finish your profile first</Text>
        <Text style={styles.emptySub}>The planner needs your branch, section and batch.</Text>
      </View>
    );
  }
  if (rows === null || tt === undefined) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} label="Loading your classes…" />;

  const below = result?.list.filter((p) => p.afterPct !== null && p.afterPct < TARGET) ?? [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Leave planner</Text>
        <Text style={styles.heroTitle}>Going somewhere? See your attendance before you go.</Text>
        <Text style={styles.heroSub}>Pick the days you’ll be away. It uses your timetable and skips holidays.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Away from</Text>
            <DateField value={from} onChange={setFrom} min={addDays(today, 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Back after</Text>
            <DateField value={to} onChange={setTo} min={from} />
          </View>
        </View>
      </View>

      {!tt ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Your timetable isn’t on the app yet</Text>
          <Text style={styles.emptySub}>The planner counts classes from your section’s timetable. Ask your class representative to get it added.</Text>
        </View>
      ) : result ? (
        <>
          <View style={[styles.summary, { backgroundColor: below.length ? colors.dangerBg : colors.successBg }]}>
            <Ionicons
              name={below.length ? "alert-circle" : "checkmark-circle"}
              size={22}
              color={below.length ? colors.danger : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryTitle, { color: below.length ? colors.danger : colors.successFg }]}>
                {result.missedTotal === 0
                  ? "No classes on these days"
                  : below.length
                    ? `${below.length} subject${below.length > 1 ? "s" : ""} would drop below ${TARGET}%`
                    : `All subjects stay at ${TARGET}% or above`}
              </Text>
              <Text style={styles.summarySub}>
                You’d miss {result.missedTotal} class{result.missedTotal === 1 ? "" : "es"} on {result.days.length} day
                {result.days.length === 1 ? "" : "s"}. This assumes you attend every class until you leave.
              </Text>
            </View>
          </View>

          {result.list.map((p) => {
            const t = tone(p.afterPct);
            return (
              <View key={p.code} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{p.code}</Text>
                  <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.meta}>
                    {p.missed ? `Misses ${p.missed} class${p.missed === 1 ? "" : "es"}` : "No classes missed"}
                    {p.needAfter ? ` · attend the next ${p.needAfter} after you’re back to reach ${TARGET}%` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.pill, { backgroundColor: t.bg }]}>
                    <Text style={[styles.pct, { color: t.fg }]}>{p.afterPct === null ? "—" : `${p.afterPct}%`}</Text>
                  </View>
                  <Text style={styles.now}>now {p.nowPct === null ? "—" : `${p.nowPct}%`}</Text>
                </View>
              </View>
            );
          })}

          {result.extra.length > 0 && (
            <Text style={styles.footnote}>
              Also on these days, with no attendance recorded yet: {result.extra.map((x) => `${x.code} (${x.n})`).join(", ")}.
            </Text>
          )}

          {result.days.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.label}>Classes you’d miss</Text>
              {result.days.map((d) => (
                <View key={d.date} style={styles.dayRow}>
                  <Text style={styles.dayDate}>{pretty(d.date)}</Text>
                  <Text style={styles.dayCodes}>{d.codes.join(", ")}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.footnote}>
            Estimate from your timetable. Lab batches, extra classes or cancelled classes can change the real numbers. Approved medical and event
            leave are already counted in your current attendance.
          </Text>
        </>
      ) : null}
      {!!error && <Text style={[styles.footnote, { color: colors.danger }]}>{error}</Text>}
    </ScrollView>
  );
}

export default function LeavePlannerScreen() {
  return (
    <PlusGate title="Leave planner" sub="Pick the days you’ll be away and see exactly where your attendance lands in every subject.">
      <Planner />
    </PlusGate>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: spacing.xl * 2, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  hero: { backgroundColor: colors.primary, borderRadius: 24, padding: 20 },
  kicker: { fontSize: 12, fontWeight: "800", color: colors.onPrimary, opacity: 0.8, letterSpacing: 0.4, textTransform: "uppercase" },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.onPrimary, marginTop: 6, lineHeight: 26 },
  heroSub: { fontSize: 13, fontWeight: "500", color: colors.onPrimary, opacity: 0.85, marginTop: 6, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16 },
  dateRow: { flexDirection: "row", gap: 12 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 },
  summary: { flexDirection: "row", gap: 12, borderRadius: 18, padding: 16, alignItems: "flex-start" },
  summaryTitle: { fontSize: 16, fontWeight: "800" },
  summarySub: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  row: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  code: { fontSize: 12, fontWeight: "800", color: colors.primary },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  meta: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pct: { fontSize: 16, fontWeight: "800" },
  now: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, marginTop: 4 },
  dayRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dayDate: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  dayCodes: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, flexShrink: 1, textAlign: "right", marginLeft: 12 },
  footnote: { fontSize: 12, fontWeight: "500", color: colors.textSecondary, lineHeight: 18, paddingHorizontal: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  emptySub: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
