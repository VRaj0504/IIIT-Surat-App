import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  subscribeToLeaveRequestsForFaculty,
  subscribeToMedicalLeavesFor,
  subscribeToMyTeacherAcks,
  resolveLeaveApplication,
  decideMedicalLeave,
  setTeacherAckDecision,
  approvalChain,
  nextMedicalStage,
  approverName,
  sessionKey,
  APPROVER_LABEL,
  ApproverRole,
  LeaveApplication,
  TeacherAck,
} from "../firebase/leaveService";

const ROLES: ApproverRole[] = ["doctor", "dr", "dean", "hod"];

const ROLE_SECTION: Record<ApproverRole, { icon: keyof typeof Ionicons.glyphMap; title: string }> = {
  doctor: { icon: "medkit-outline", title: "Medical leaves to check" },
  dr: { icon: "document-text-outline", title: "Approve as Deputy Registrar" },
  dean: { icon: "ribbon-outline", title: "Approve as Dean" },
  hod: { icon: "shield-checkmark-outline", title: "Approve as HOD" },
};

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
import { KeyboardAwareScrollView } from "../components/KeyboardAware";

const statusColors: Record<LeaveApplication["status"], string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
}

function openReport(url?: string | null) {
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open the report"));
}

function SectionTitle({ icon, title, count }: { icon: keyof typeof Ionicons.glyphMap; title: string; count: number }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

export default function LeaveRequestsScreen() {
  const { profile } = useAuth();
  const email = profile?.email?.toLowerCase() ?? "";
  const [casual, setCasual] = useState<LeaveApplication[] | null>(null);
  const [byRole, setByRole] = useState<Record<ApproverRole, LeaveApplication[] | null>>({
    doctor: null,
    dr: null,
    dean: null,
    hod: null,
  });
  const [acks, setAcks] = useState<TeacherAck[] | null>(null);
  const [declinedDraft, setDeclinedDraft] = useState<Record<string, string[]>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!email) return;
    const unsubs = [

      subscribeToLeaveRequestsForFaculty(email, (apps) => setCasual(apps.filter((a) => a.type !== "medical" || !a.stage))),
      ...ROLES.map((role) =>
        subscribeToMedicalLeavesFor(role, email, (apps) => setByRole((prev) => ({ ...prev, [role]: apps }))),
      ),
      subscribeToMyTeacherAcks(email, setAcks),
    ];
    return () => unsubs.forEach((u) => u());
  }, [email]);

  const loading = casual === null || ROLES.some((r) => byRole[r] === null) || acks === null;

  const pendingByRole = useMemo(() => {
    const out = {} as Record<ApproverRole, LeaveApplication[]>;
    for (const r of ROLES) out[r] = (byRole[r] ?? []).filter((a) => a.stage === r);
    return out;
  }, [byRole]);
  const pendingApprovals = ROLES.reduce((n, r) => n + pendingByRole[r].length, 0);
  const recentCutoff = isoDaysAgo(30);
  const pendingAcks = useMemo(() => (acks ?? []).filter((a) => a.status === "pending"), [acks]);
  const recentAcks = useMemo(
    () => (acks ?? []).filter((a) => a.status !== "pending" && a.toDate >= recentCutoff),
    [acks, recentCutoff],
  );
  const pendingCasual = useMemo(() => (casual ?? []).filter((a) => a.status === "pending"), [casual]);

  const setRemark = (id: string, text: string) => setRemarks((prev) => ({ ...prev, [id]: text }));

  const decideMedical = (app: LeaveApplication, role: ApproverRole, decision: "approved" | "rejected") => {
    if (!profile?.uid) return;
    const remark = remarks[app.id]?.trim();
    if (decision === "rejected" && !remark) {
      Alert.alert("Add a reason first", "Write a short remark so the student knows why it was rejected.");
      return;
    }
    const run = async () => {
      setBusyId(app.id);
      try {
        await decideMedicalLeave({
          app,
          role,
          decision,
          remark,
          deciderUid: profile.uid,
          deciderName: profile.name,
        });
      } catch (err: any) {
        Alert.alert("Couldn't update", err.message ?? "Please try again.");
      } finally {
        setBusyId(null);
      }
    };
    const nextStage = nextMedicalStage(role, app);
    const next =
      nextStage === "teachers"
        ? "final approval. The student's classes in these dates will count as present"
        : `${approverName(nextStage as ApproverRole, app)} for approval`;
    Alert.alert(
      decision === "approved" ? "Approve this leave?" : "Reject this leave?",
      decision === "approved" ? `It will go to ${next}.` : "The student will be notified with your remark.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: decision === "approved" ? "Approve" : "Reject",
          style: decision === "rejected" ? "destructive" : "default",
          onPress: run,
        },
      ],
    );
  };

  const declinedFor = (ack: TeacherAck): string[] => declinedDraft[ack.leaveId + ack.id] ?? ack.declinedSessions ?? [];

  const toggleSession = (ack: TeacherAck, key: string) => {
    const k = ack.leaveId + ack.id;
    const cur = declinedFor(ack);
    setDeclinedDraft((prev) => ({ ...prev, [k]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] }));
  };

  const saveAck = async (ack: TeacherAck, status: "excused" | "declined") => {
    if (!profile?.uid) return;
    const key = ack.leaveId + ack.id;
    setBusyId(key);
    try {
      await setTeacherAckDecision({
        leaveId: ack.leaveId,
        teacherEmail: ack.id,
        uid: profile.uid,
        status,
        declinedSessions: declinedFor(ack),
        remark: remarks[key],
      });
      setDeclinedDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err: any) {
      Alert.alert("Couldn't save", err.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const resolveCasual = async (app: LeaveApplication, status: "approved" | "rejected") => {
    if (!profile?.uid) return;
    setBusyId(app.id);
    try {
      await resolveLeaveApplication(app.id, profile.uid, status, remarks[app.id]);
    } catch (err: any) {
      Alert.alert("Couldn't update", err.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const renderMedicalCard = (app: LeaveApplication, role: ApproverRole) => {
    const chain = approvalChain(app);
    const step = chain.indexOf(role) + 1;
    const nextStage = nextMedicalStage(role, app);
    const prior = chain.slice(0, chain.indexOf(role));
    return (
    <View key={`${role}-${app.id}`} style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.studentName}>{app.studentName}</Text>
        <View style={[styles.statusPill, { backgroundColor: colors.warning + "20" }]}>
          <Text style={[styles.statusPillText, { color: colors.warning }]}>
            Step {step} of {chain.length} · {APPROVER_LABEL[role]}
          </Text>
        </View>
      </View>
      {app.studentEnrollmentNumber && <Text style={styles.meta}>{app.studentEnrollmentNumber}</Text>}
      <Text style={styles.meta}>
        {prettyDate(app.fromDate)} → {prettyDate(app.toDate)} · {dayCount(app.fromDate, app.toDate)} day(s)
      </Text>
      <Text style={styles.reason}>{app.reason}</Text>
      {app.medicalReportUrl && (
        <TouchableOpacity onPress={() => openReport(app.medicalReportUrl)} style={styles.reportButton}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={styles.reportButtonText}>Open medical report</Text>
        </TouchableOpacity>
      )}
      {prior.map((r) => {
        const d = app[`${r}Decision` as const];
        if (!d) return null;
        return (
          <View key={r} style={styles.priorStep}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.priorStepText}>
              {APPROVER_LABEL[r]}: approved by {d.byName}
              {d.remark ? `: "${d.remark}"` : ""}
            </Text>
          </View>
        );
      })}
      <TextInput
        style={styles.remarkInput}
        value={remarks[app.id] ?? ""}
        onChangeText={(t) => setRemark(app.id, t)}
        placeholder="Remark (required to reject)"
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          disabled={busyId === app.id}
          onPress={() => decideMedical(app, role, "approved")}
        >
          <Text style={styles.approveButtonText}>
            {nextStage === "teachers" ? "Final approve" : `Approve → ${APPROVER_LABEL[nextStage as ApproverRole]}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          disabled={busyId === app.id}
          onPress={() => decideMedical(app, role, "rejected")}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  const renderAckCard = (ack: TeacherAck) => {
    const key = ack.leaveId + ack.id;
    const declined = declinedFor(ack);
    const allDeclined = ack.status === "declined";
    const total = ack.subjects.reduce((n, s) => n + s.dates.length, 0);
    const excusedCount = allDeclined ? 0 : total - declined.length;
    const dirty = declinedDraft[key] !== undefined;
    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.studentName}>{ack.studentName}</Text>
          <View style={[styles.statusPill, { backgroundColor: (allDeclined ? colors.danger : colors.success) + "20" }]}>
            <Text style={[styles.statusPillText, { color: allDeclined ? colors.danger : colors.success }]}>
              {allDeclined ? "Not excused" : ack.status === "pending" ? "Waiting for you" : `${excusedCount}/${total} excused`}
            </Text>
          </View>
        </View>
        {ack.studentEnrollmentNumber && <Text style={styles.meta}>{ack.studentEnrollmentNumber}</Text>}
        <Text style={styles.meta}>
          Approved medical leave {prettyDate(ack.fromDate)} → {prettyDate(ack.toDate)}
        </Text>
        <Text style={styles.ackLead}>
          Your classes in these dates count as present automatically. Tap a class to not excuse it.
        </Text>
        {ack.subjects.map((s) => (
          <View key={s.code} style={styles.subjectRow}>
            <Text style={styles.subjectName}>
              {s.name} <Text style={styles.subjectCode}>({s.code})</Text>
            </Text>
            <View style={styles.sessionRow}>
              {s.dates.map((d) => {
                const k = sessionKey(s.code, d);
                const off = allDeclined || declined.includes(k);
                return (
                  <TouchableOpacity
                    key={k}
                    disabled={allDeclined}
                    onPress={() => toggleSession(ack, k)}
                    style={[styles.sessionChip, off ? styles.sessionChipOff : styles.sessionChipOn]}
                  >
                    <Ionicons name={off ? "close" : "checkmark"} size={14} color={off ? colors.danger : colors.success} />
                    <Text style={[styles.sessionChipText, { color: off ? colors.danger : colors.success }]}>{prettyDate(d)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        <TextInput
          style={styles.remarkInput}
          value={remarks[key] ?? ack.remark ?? ""}
          onChangeText={(t) => setRemark(key, t)}
          placeholder="Optional note for the student"
          placeholderTextColor={colors.textSecondary}
        />
        <View style={styles.actionRow}>
          {allDeclined ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              disabled={busyId === key}
              onPress={() => saveAck(ack, "excused")}
            >
              <Text style={styles.approveButtonText}>Excuse classes again</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                disabled={busyId === key || (!dirty && ack.status !== "pending" && remarks[key] === undefined)}
                onPress={() => saveAck(ack, "excused")}
              >
                <Text style={styles.approveButtonText}>{ack.status === "pending" ? "Excuse classes" : "Save changes"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                disabled={busyId === key}
                onPress={() =>
                  Alert.alert("Don't excuse any?", `None of ${ack.studentName}'s classes with you in these dates will count as present.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Don't excuse", style: "destructive", onPress: () => saveAck(ack, "declined") },
                  ])
                }
              >
                <Text style={styles.rejectButtonText}>Don't excuse any</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderCasualCard = (item: LeaveApplication) => (
    <View key={`casual-${item.id}`} style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.studentName}>{item.studentName}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColors[item.status] + "20" }]}>
          <Text style={[styles.statusPillText, { color: statusColors[item.status] }]}>{item.status}</Text>
        </View>
      </View>
      {item.studentEnrollmentNumber && <Text style={styles.meta}>{item.studentEnrollmentNumber}</Text>}
      <Text style={styles.meta}>
        {item.type === "medical" ? "Medical" : "Casual"} · {item.fromDate} to {item.toDate}
      </Text>
      <Text style={styles.reason}>{item.reason}</Text>
      {item.medicalReportUrl && (
        <TouchableOpacity onPress={() => openReport(item.medicalReportUrl)} style={styles.reportButton}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={styles.reportButtonText}>Open medical report</Text>
        </TouchableOpacity>
      )}
      <TextInput
        style={styles.remarkInput}
        value={remarks[item.id] ?? ""}
        onChangeText={(t) => setRemark(item.id, t)}
        placeholder="Optional remark"
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          disabled={busyId === item.id}
          onPress={() => resolveCasual(item, "approved")}
        >
          <Text style={styles.approveButtonText}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          disabled={busyId === item.id}
          onPress={() => resolveCasual(item, "rejected")}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const historyRows = useMemo(() => {
    type Row = { key: string; title: string; detail: string; ok: boolean };
    const rows: Row[] = [];
    for (const r of ROLES) {
      for (const a of byRole[r] ?? []) {
        if (a.stage === r) continue;
        const d = a[`${r}Decision` as const];
        if (!d) continue;
        const ok = d.decision !== "rejected";
        rows.push({
          key: `${r}-${a.id}`,
          title: a.studentName,
          detail: `Medical ${a.fromDate} → ${a.toDate} · you ${ok ? "approved" : "rejected"} as ${APPROVER_LABEL[r]}`,
          ok,
        });
      }
    }
    for (const k of acks ?? []) {
      if (k.status === "pending" || k.toDate >= recentCutoff) continue;
      const ok = k.status !== "declined";
      rows.push({ key: `t-${k.leaveId}-${k.id}`, title: k.studentName, detail: `Medical ${k.fromDate} → ${k.toDate} · ${ok ? "classes excused" : "not excused"}`, ok });
    }
    for (const c of casual ?? []) {
      if (c.status === "pending") continue;
      rows.push({ key: `c-${c.id}`, title: c.studentName, detail: `Casual ${c.fromDate} → ${c.toDate} · ${c.status}`, ok: c.status === "approved" });
    }
    return rows;
  }, [byRole, acks, casual, recentCutoff]);

  const nothingPending = pendingApprovals + pendingAcks.length + pendingCasual.length === 0;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView behavior={undefined} style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Leave Requests</Text>

          {loading ? (
            <LoadingSpinner style={{ marginTop: spacing.xl }} />
          ) : (
            <KeyboardAwareScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {ROLES.map((r) =>
                pendingByRole[r].length > 0 ? (
                  <React.Fragment key={r}>
                    <SectionTitle icon={ROLE_SECTION[r].icon} title={ROLE_SECTION[r].title} count={pendingByRole[r].length} />
                    {pendingByRole[r].map((a) => renderMedicalCard(a, r))}
                  </React.Fragment>
                ) : null,
              )}
              {pendingAcks.length > 0 && (
                <>
                  <SectionTitle icon="calendar-outline" title="Excuse missed classes" count={pendingAcks.length} />
                  {pendingAcks.map(renderAckCard)}
                </>
              )}
              {recentAcks.length > 0 && (
                <>
                  <SectionTitle icon="medkit-outline" title="Medical leave in your classes" count={0} />
                  {recentAcks.map(renderAckCard)}
                </>
              )}
              {pendingCasual.length > 0 && (
                <>
                  <SectionTitle icon="mail-open-outline" title="Casual leave" count={pendingCasual.length} />
                  {pendingCasual.map(renderCasualCard)}
                </>
              )}

              {nothingPending && <Text style={styles.emptyText}>Nothing waiting for you right now.</Text>}

              {historyRows.length > 0 && (
                <TouchableOpacity style={styles.historyToggle} onPress={() => setShowHistory((v) => !v)}>
                  <Text style={styles.historyToggleText}>
                    {showHistory ? "Hide" : "Show"} handled ({historyRows.length})
                  </Text>
                  <Ionicons name={showHistory ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
              {showHistory &&
                historyRows.map((r) => (
                  <View key={r.key} style={styles.historyRow}>
                    <Ionicons
                      name={r.ok ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={r.ok ? colors.success : colors.danger}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{r.title}</Text>
                      <Text style={styles.meta}>{r.detail}</Text>
                    </View>
                  </View>
                ))}
            </KeyboardAwareScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: "center",
  },
  countBadgeText: { color: colors.surface, fontSize: 11, fontWeight: "800" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  studentName: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reason: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    backgroundColor: colors.primary + "12",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  reportButtonText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  priorStep: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  priorStepText: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  ackLead: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, fontWeight: "700" },
  subjectRow: { marginTop: 6, backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm },
  subjectName: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  subjectCode: { fontWeight: "400", color: colors.textSecondary },
  subjectDates: { fontSize: 12, color: colors.textPrimary, marginTop: 2 },
  sessionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  sessionChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, minHeight: 36 },
  sessionChipOn: { backgroundColor: colors.success + "18" },
  sessionChipOff: { backgroundColor: colors.danger + "18" },
  sessionChipText: { fontSize: 12, fontWeight: "700" },
  remarkInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.textPrimary,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.md, alignItems: "center" },
  approveButton: { backgroundColor: colors.success + "20" },
  approveButtonText: { color: colors.success, fontWeight: "700" },
  rejectButton: { backgroundColor: colors.danger + "20" },
  rejectButtonText: { color: colors.danger, fontWeight: "700" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  historyToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center", marginTop: spacing.lg, padding: spacing.sm },
  historyToggleText: { color: colors.primary, fontWeight: "700" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  historyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
});
