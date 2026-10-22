import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { subscribeToMyLeaveApplications, excusedSessionSet, LeaveApplication } from "../firebase/leaveService";
import { readCached, writeCached } from "../firebase/liveCache";
import { getMyAttendance, SubjectAttendance, ATTENDANCE_TARGET } from "../firebase/attendanceService";
import { getCurrentSemester } from "../utils/academicInfo";
import LoadingSpinner from "../components/LoadingSpinner";

function prettyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const tone = (p: number) =>
  p >= ATTENDANCE_TARGET + 5
    ? { fg: colors.success, bg: colors.successBg }
    : p >= ATTENDANCE_TARGET
      ? { fg: "#B45309", bg: "#FEF3C7" }
      : { fg: colors.danger, bg: colors.dangerBg };

export default function MyAttendanceScreen() {
  const { profile } = useAuth();
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveApplication[] | null>(null);
  const [rows, setRows] = useState<SubjectAttendance[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const ready = !!(profile?.enrollmentNumber && profile.branch && profile.admissionYear && semester);

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

  const excused = useMemo(() => excusedSessionSet(leaves ?? []), [leaves]);

  const cacheKey = ready ? `att:${profile!.enrollmentNumber}:${semester}` : "";
  useEffect(() => {
    if (!cacheKey) return;
    readCached<SubjectAttendance[]>(cacheKey).then((v) => v && setRows((r) => r ?? v));
  }, [cacheKey]);

  const load = useCallback(async () => {
    if (!ready || subjects === null) return;
    try {
      setError("");
      const fresh = await getMyAttendance({
          enrollmentNumber: profile!.enrollmentNumber!,
          branch: profile!.branch!,
          admissionYear: profile!.admissionYear!,
          section: profile!.section ?? null,
          specialization: profile!.specialization ?? null,
          semester: semester!,
          subjects,
          medicalExcusedSessions: excused,
        });
      writeCached(cacheKey, fresh);
      setRows(fresh);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load attendance.");
      setRows((r) => r ?? []);
    }
  }, [ready, subjects, excused, profile, semester, cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!ready) {
    return (
      <View style={[styles.page, styles.center]}>
        <Ionicons name="person-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>Finish your profile first</Text>
        <Text style={styles.emptySub}>Attendance needs your enrollment number, branch, section and batch.</Text>
      </View>
    );
  }

  if (rows === null) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} label="Loading attendance…" />;

  const held = rows.reduce((a, r) => a + r.totalSessions, 0);
  const present = rows.reduce((a, r) => a + r.presentCount, 0);
  const overall = held ? Math.round((present / held) * 1000) / 10 : null;
  const low = rows.filter((r) => r.percentage < ATTENDANCE_TARGET);

  const pending = (subjects ?? []).filter(
    (s) => !rows.some((r) => r.subjectCode.replace(/\s+/g, "").toUpperCase() === s.code.replace(/\s+/g, "").toUpperCase()),
  );

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
        <Text style={styles.heroKicker}>
          Semester {semester} · {[profile!.branch, profile!.section].filter(Boolean).join(" ")}
        </Text>
        {overall === null ? (
          <>
            <Text style={styles.heroBig}>No classes yet</Text>
            <Text style={styles.heroSub}>Your attendance shows up here as soon as a teacher marks a class.</Text>
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text style={styles.heroBig}>{overall}%</Text>
              <Text style={styles.heroUnit}>overall</Text>
            </View>
            <Text style={styles.heroSub}>
              {present} of {held} classes attended
              {low.length ? ` · below ${ATTENDANCE_TARGET}% in ${low.length} subject${low.length > 1 ? "s" : ""}` : ` · all subjects at ${ATTENDANCE_TARGET}% or above`}
            </Text>
          </>
        )}
      </Animated.View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error} Pull down to retry.</Text>
        </View>
      )}

      {rows.map((r, i) => {
        const t = tone(r.percentage);
        return (
          <Animated.View key={r.subjectCode} entering={FadeInDown.delay(60 + i * 40).duration(350)} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{r.subjectCode}</Text>
                <Text style={styles.name} numberOfLines={2}>{r.subjectName}</Text>
              </View>
              <View style={[styles.pctPill, { backgroundColor: t.bg }]}>
                <Text style={[styles.pct, { color: t.fg }]}>{r.percentage}%</Text>
              </View>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, r.percentage)}%`, backgroundColor: t.fg }]} />
              <View style={[styles.mark, { left: `${ATTENDANCE_TARGET}%` }]} />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {r.presentCount}/{r.totalSessions} attended
                {r.lastClass ? ` · last ${prettyDate(r.lastClass)}` : ""}
              </Text>
              <Text style={[styles.advice, { color: t.fg }]}>
                {r.percentage >= ATTENDANCE_TARGET
                  ? r.canMiss > 0
                    ? `Can miss ${r.canMiss}`
                    : "Don't miss the next one"
                  : `Attend next ${r.needToAttend} to reach ${ATTENDANCE_TARGET}%`}
              </Text>
            </View>
          </Animated.View>
        );
      })}

      {pending.length > 0 && rows.length > 0 && (
        <Text style={styles.pending}>
          No classes recorded yet for {pending.map((p) => p.code).join(", ")}.
        </Text>
      )}

      <Text style={styles.footnote}>
        A 2-hour lab or workshop counts as 2 classes, and only your own lab batch counts for you. On-duty, approved event excusals and medical leave your teacher confirmed count as attended. Something looks wrong?
        Ask the subject teacher — they can correct it on the faculty portal.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", padding: 32, gap: 6 },
  content: { padding: 18, paddingBottom: spacing.xl * 2, gap: 10 },
  hero: { backgroundColor: colors.heroBg, borderRadius: 24, padding: 20, marginBottom: 4 },
  heroKicker: { color: colors.heroMuted, fontSize: 13, fontWeight: "700" },
  heroBig: { color: colors.heroText, fontSize: 40, fontWeight: "800", letterSpacing: -1, marginTop: 6 },
  heroUnit: { color: colors.heroMuted, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  heroSub: { color: colors.heroMuted, fontSize: 13, fontWeight: "600", marginTop: 4, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  code: { fontSize: 12, fontWeight: "800", color: colors.primary, letterSpacing: 0.3 },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 2 },
  pctPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  pct: { fontSize: 16, fontWeight: "800" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: 14, overflow: "visible" },
  fill: { height: 8, borderRadius: 4 },
  mark: { position: "absolute", top: -3, width: 2, height: 14, borderRadius: 1, backgroundColor: colors.textPrimary, opacity: 0.35 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 },
  meta: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, flexShrink: 1 },
  advice: { fontSize: 12, fontWeight: "800", textAlign: "right" },
  pending: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 4, paddingHorizontal: 4 },
  footnote: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
  errorBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.dangerBg, borderRadius: 14, padding: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: "600" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginTop: 6 },
  emptySub: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
});
