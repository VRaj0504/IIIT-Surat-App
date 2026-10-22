import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import ScreenHeader from "../components/ScreenHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import { subscribeToMyGrades, GradeEntry } from "../firebase/gradesService";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import {
  EXAM_EVENT_LABELS,
  ExamEvent,
  ExamRegistration,
  RegisteredSubject,
  eventAppliesTo,
  isRegistrationOpen,
  saveExamRegistration,
  subscribeToActiveExamEvents,
  subscribeToMyExamRegistrations,
  withdrawExamRegistration,
} from "../firebase/examService";
import { evaluateStudent, Backlog, ExamAlert, GRADE_LABELS, Standing } from "../utils/examRules";

const STANDING: Record<Standing, { label: string; sub: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  "no-results": { label: "No results yet", sub: "Your grades will appear here once they are entered.", bg: colors.surfaceAlt, fg: colors.textSecondary, icon: "time-outline" },
  clear: { label: "All clear", sub: "No backlogs. Keep it up!", bg: colors.successBg, fg: colors.successFg, icon: "checkmark-circle" },
  backlogs: { label: "Backlogs to clear", sub: "Clear them in the next supplementary exam or by repeating the course.", bg: colors.tile.yellow.bg, fg: colors.tile.yellow.fg, icon: "alert-circle" },
  "at-risk": { label: "Action needed", sub: "Read the warnings below and talk to your HOD or the exam office.", bg: colors.dangerBg, fg: colors.danger, icon: "warning" },
};

const ALERT_TONE: Record<ExamAlert["level"], { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  high: { bg: colors.dangerBg, fg: colors.danger, icon: "warning-outline" },
  medium: { bg: colors.tile.yellow.bg, fg: colors.tile.yellow.fg, icon: "alert-circle-outline" },
  info: { bg: colors.tile.blue.bg, fg: colors.tile.blue.fg, icon: "information-circle-outline" },
};

function formatDeadline(event: ExamEvent): string | null {
  if (!event.deadline) return null;
  return event.deadline.toDate().toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BacklogRow({ b }: { b: Backlog }) {
  return (
    <View style={styles.backlogRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.backlogName}>{b.subjectName || b.subjectCode}</Text>
        <Text style={styles.backlogMeta}>
          {b.subjectCode} · Sem {b.semester} · {b.credits} cr{b.attempts > 1 ? ` · attempt ${b.attempts}` : ""}
        </Text>
        <Text style={styles.backlogAction}>{b.action}</Text>
      </View>
      <View style={[styles.gradeBadge, b.kind === "pending" ? styles.gradeBadgePending : styles.gradeBadgeFail]}>
        <Text style={[styles.gradeBadgeText, b.kind === "pending" ? { color: colors.tile.blue.fg } : { color: colors.danger }]}>{b.grade}</Text>
      </View>
    </View>
  );
}

export default function ExamStatusScreen() {
  const { profile } = useAuth();
  const [grades, setGrades] = useState<GradeEntry[] | null>(null);
  const [events, setEvents] = useState<ExamEvent[]>([]);
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [activeEvent, setActiveEvent] = useState<ExamEvent | null>(null);
  const [picked, setPicked] = useState<Record<string, RegisteredSubject>>({});
  const [medicalDeclared, setMedicalDeclared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.enrollmentNumber) {
      setGrades([]);
      return;
    }
    return subscribeToMyGrades(profile.enrollmentNumber, setGrades);
  }, [profile?.enrollmentNumber]);

  useEffect(() => subscribeToActiveExamEvents(setEvents), []);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeToMyExamRegistrations(profile.uid, setRegistrations);
  }, [profile?.uid]);

  const status = useMemo(
    () => (grades ? evaluateStudent(grades, profile?.admissionYear ?? null) : null),
    [grades, profile?.admissionYear],
  );

  useEffect(() => {
    if (!profile?.branch || !status) return;
    return subscribeToCurriculum(profile.branch, Math.min(status.currentSemester, 8), setCurriculum);
  }, [profile?.branch, status?.currentSemester]);

  const myEvents = useMemo(
    () => events.filter((e) => eventAppliesTo(e, { branch: profile?.branch, admissionYear: profile?.admissionYear })),
    [events, profile?.branch, profile?.admissionYear],
  );

  const regByEvent = useMemo(() => {
    const m = new Map<string, ExamRegistration>();
    registrations.forEach((r) => m.set(r.eventId, r));
    return m;
  }, [registrations]);

  const choicesFor = (event: ExamEvent): RegisteredSubject[] => {
    if (event.registration === "backlogs") {
      return (status?.backlogs ?? [])
        .filter((b) => b.kind === "supplementary" || b.kind === "pending")
        .map((b) => ({ code: b.subjectCode, name: b.subjectName, semester: b.semester, grade: b.grade }));
    }
    if (event.registration === "subjects") {
      return curriculum.map((c) => ({ code: c.code, name: c.name, semester: status?.currentSemester ?? 0, grade: null }));
    }
    return [];
  };

  const openRegistration = (event: ExamEvent) => {
    const existing = regByEvent.get(event.id);
    const next: Record<string, RegisteredSubject> = {};
    existing?.subjects.forEach((s) => (next[s.code] = s));
    setPicked(next);
    setMedicalDeclared(existing?.medicalDeclared ?? false);
    setActiveEvent(event);
  };

  const submit = async () => {
    if (!activeEvent || !profile?.enrollmentNumber || !profile.branch || !profile.admissionYear) return;
    const subjects = Object.values(picked);
    if (subjects.length === 0) {
      Alert.alert("Pick at least one subject", "Select the subjects you want to register for.");
      return;
    }
    if (activeEvent.requiresMedical && !medicalDeclared) {
      Alert.alert("Medical form", "Confirm that you have submitted the hard copy of the institute medical form to the office.");
      return;
    }
    setSaving(true);
    try {
      await saveExamRegistration({
        event: activeEvent,
        studentUid: profile.uid,
        enrollmentNumber: profile.enrollmentNumber,
        studentName: profile.name,
        branch: profile.branch,
        section: profile.section ?? null,
        admissionYear: profile.admissionYear,
        subjects,
        medicalDeclared,
        alreadyRegistered: regByEvent.has(activeEvent.id),
      });
      setActiveEvent(null);
      Alert.alert("Registered", `Your registration for "${activeEvent.title}" has been sent to the exam office.`);
    } catch (err: any) {
      Alert.alert("Couldn't register", err?.message ?? "Registration may be closed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = (event: ExamEvent) => {
    if (!profile?.enrollmentNumber) return;
    Alert.alert("Withdraw registration?", `You will be removed from "${event.title}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          try {
            await withdrawExamRegistration(event.id, profile.enrollmentNumber!);
          } catch (err: any) {
            Alert.alert("Couldn't withdraw", err?.message ?? "Try again.");
          }
        },
      },
    ]);
  };

  if (!status) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const standing = STANDING[status.standing];
  const supp = status.backlogs.filter((b) => b.kind === "supplementary");
  const repeat = status.backlogs.filter((b) => b.kind === "repeat");
  const pending = status.backlogs.filter((b) => b.kind === "pending");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Exam Status" subtitle={`Year ${status.yearOfStudy} · Semester ${status.currentSemester}`} />

          <View style={[styles.hero, { backgroundColor: standing.bg }]}>
            <View style={styles.heroTop}>
              <Ionicons name={standing.icon} size={26} color={standing.fg} />
              <Text style={[styles.heroTitle, { color: standing.fg }]}>{standing.label}</Text>
            </View>
            <Text style={[styles.heroSub, { color: standing.fg }]}>{standing.sub}</Text>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{status.cgpa?.toFixed(2) ?? "—"}</Text>
                <Text style={styles.statLabel}>CGPA</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{status.earnedCredits}</Text>
                <Text style={styles.statLabel}>Earned credits</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, status.counts.total > 0 && { color: colors.danger }]}>{status.counts.total}</Text>
                <Text style={styles.statLabel}>Backlogs</Text>
              </View>
            </View>
          </View>

          {status.creditTarget && (
            <View style={styles.targetCard}>
              <Text style={styles.targetTitle}>
                Year {status.creditTarget.year} minimum: {status.creditTarget.needed} earned credits
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, (status.creditTarget.earned / status.creditTarget.needed) * 100)}%`,
                      backgroundColor: status.creditTarget.earned >= status.creditTarget.needed ? colors.success : colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.targetSub}>
                {status.creditTarget.checked
                  ? `${status.creditTarget.earned} of ${status.creditTarget.needed} (Rule 10.3)`
                  : `${status.creditTarget.earned} so far. Some earlier semesters aren't recorded in CollegeGo yet, so this isn't a final check.`}
              </Text>
            </View>
          )}

          {status.alerts.map((a, i) => {
            const tone = ALERT_TONE[a.level];
            return (
              <View key={i} style={[styles.alertCard, { backgroundColor: tone.bg }]}>
                <Ionicons name={tone.icon} size={20} color={tone.fg} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: tone.fg }]}>{a.title}</Text>
                  <Text style={styles.alertDetail}>{a.detail}</Text>
                  <Text style={styles.alertRule}>{a.rule}</Text>
                </View>
              </View>
            );
          })}

          {supp.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Supplementary exam ({supp.length})</Text>
              {supp.map((b) => <BacklogRow key={b.subjectCode} b={b} />)}
            </View>
          )}
          {repeat.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Repeat the course ({repeat.length})</Text>
              {repeat.map((b) => <BacklogRow key={b.subjectCode} b={b} />)}
            </View>
          )}
          {pending.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incomplete ({pending.length})</Text>
              {pending.map((b) => <BacklogRow key={b.subjectCode} b={b} />)}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Exam notices</Text>
            {myEvents.length === 0 ? (
              <Text style={styles.muted}>No open exam notices for you right now.</Text>
            ) : (
              myEvents.map((event) => {
                const reg = regByEvent.get(event.id);
                const open = isRegistrationOpen(event);
                const deadline = formatDeadline(event);
                return (
                  <View key={event.id} style={styles.eventCard}>
                    <Text style={styles.eventType}>{EXAM_EVENT_LABELS[event.type]}</Text>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    {!!event.details && <Text style={styles.eventDetails}>{event.details}</Text>}
                    {deadline && (
                      <Text style={[styles.eventDeadline, !open && event.registration !== "none" && { color: colors.danger }]}>
                        {open || event.registration === "none" ? "Deadline" : "Closed"}: {deadline}
                      </Text>
                    )}
                    {event.requiresMedical && (
                      <Text style={styles.eventNote}>Only for students who submitted the hard copy of the institute medical form.</Text>
                    )}
                    {reg && (
                      <View style={styles.regBox}>
                        <Text style={styles.regStatus}>
                          {reg.status === "accepted" ? "Accepted" : reg.status === "rejected" ? "Not accepted" : "Registered"} ·{" "}
                          {reg.subjects.map((s) => s.code).join(", ")}
                        </Text>
                        {!!reg.remark && <Text style={styles.regRemark}>{reg.remark}</Text>}
                      </View>
                    )}
                    <View style={styles.eventActions}>
                      {event.link && (
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(event.link!).catch(() => {})}>
                          <Ionicons name="open-outline" size={16} color={colors.primary} />
                          <Text style={styles.secondaryBtnText}>Open link</Text>
                        </TouchableOpacity>
                      )}
                      {open && (!reg || reg.status === "submitted") && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => openRegistration(event)}>
                          <Text style={styles.primaryBtnText}>{reg ? "Edit registration" : "Register"}</Text>
                        </TouchableOpacity>
                      )}
                      {open && reg && reg.status === "submitted" && (
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => withdraw(event)}>
                          <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>Withdraw</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <Text style={styles.footnote}>
            Worked out from the grades recorded in CollegeGo and the IIIT Surat B.Tech Academic Ordinance. The exam office's
            records are final.
          </Text>
        </ScrollView>

        <Modal visible={!!activeEvent} animationType="slide" transparent onRequestClose={() => setActiveEvent(null)}>
          <View style={styles.modalScrim}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{activeEvent?.title}</Text>
              <Text style={styles.modalSub}>
                {activeEvent?.registration === "backlogs" ? "Pick the backlog subjects you will write." : "Pick the subjects you missed."}
              </Text>
              <ScrollView style={{ maxHeight: 340 }}>
                {activeEvent && choicesFor(activeEvent).length === 0 && (
                  <Text style={styles.muted}>
                    {activeEvent.registration === "backlogs"
                      ? "You have no backlogs that need this exam."
                      : "No subjects found for your current semester."}
                  </Text>
                )}
                {activeEvent &&
                  choicesFor(activeEvent).map((s) => {
                    const on = !!picked[s.code];
                    return (
                      <TouchableOpacity
                        key={s.code}
                        style={[styles.choiceRow, on && styles.choiceRowOn]}
                        onPress={() =>
                          setPicked((prev) => {
                            const next = { ...prev };
                            if (next[s.code]) delete next[s.code];
                            else next[s.code] = s;
                            return next;
                          })
                        }
                      >
                        <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.choiceName}>{s.name || s.code}</Text>
                          <Text style={styles.choiceMeta}>
                            {s.code} · Sem {s.semester}
                            {s.grade ? ` · ${s.grade} (${GRADE_LABELS[s.grade] ?? s.grade})` : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
              {activeEvent?.requiresMedical && (
                <TouchableOpacity style={styles.choiceRow} onPress={() => setMedicalDeclared((v) => !v)}>
                  <Ionicons name={medicalDeclared ? "checkbox" : "square-outline"} size={22} color={medicalDeclared ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.choiceName, { flex: 1 }]}>
                    I have submitted the hard copy of the institute medical form to the office.
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setActiveEvent(null)} disabled={saving}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryBtnText}>Submit</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  content: { paddingBottom: spacing.xl * 2 },
  hero: { borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroTitle: { ...typography.h2 },
  heroSub: { ...typography.caption, marginTop: spacing.xs },
  statRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  statValue: { ...typography.h2, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  targetCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  targetTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  targetSub: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  alertCard: { flexDirection: "row", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  alertTitle: { ...typography.body, fontWeight: "700" },
  alertDetail: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  alertRule: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontStyle: "italic" },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  backlogRow: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  backlogName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  backlogMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  backlogAction: { ...typography.caption, color: colors.textPrimary, marginTop: spacing.xs },
  gradeBadge: { alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  gradeBadgeFail: { backgroundColor: colors.dangerBg },
  gradeBadgePending: { backgroundColor: colors.tile.blue.bg },
  gradeBadgeText: { fontWeight: "800", fontSize: 14 },
  muted: { ...typography.caption, color: colors.textSecondary },
  eventCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  eventType: { ...typography.caption, color: colors.primary, fontWeight: "700", textTransform: "uppercase" },
  eventTitle: { ...typography.h3, color: colors.textPrimary, marginTop: 2 },
  eventDetails: { ...typography.caption, color: colors.textPrimary, marginTop: spacing.xs },
  eventDeadline: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, fontWeight: "700" },
  eventNote: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
  regBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  regStatus: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  regRemark: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  eventActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: colors.onPrimary, fontWeight: "700" },
  secondaryBtn: { flexDirection: "row", gap: 6, alignItems: "center", borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  secondaryBtnText: { color: colors.primary, fontWeight: "700" },
  footnote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.lg, textAlign: "center" },
  modalScrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  modalSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, marginBottom: 4 },
  choiceRowOn: { backgroundColor: colors.tile.blue.bg },
  choiceName: { ...typography.body, color: colors.textPrimary },
  choiceMeta: { ...typography.caption, color: colors.textSecondary },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
