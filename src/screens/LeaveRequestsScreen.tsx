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
  confirmTeacherAck,
  LeaveApplication,
  TeacherAck,
} from "../firebase/leaveService";

// One desk for every kind of leave work a faculty member can have:
//   • Doctor     — medical leaves waiting for a report check (step 1)
//   • HOD        — medical leaves the doctor approved (step 2)
//   • Teacher    — approved medical leaves: excuse the classes missed (step 3)
//   • Casual     — casual leave addressed to this faculty member
// A section only appears if this person has something in it, so a regular
// teacher just sees their own lists, not the doctor's or HOD's.

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
  const [asDoctor, setAsDoctor] = useState<LeaveApplication[] | null>(null);
  const [asHod, setAsHod] = useState<LeaveApplication[] | null>(null);
  const [acks, setAcks] = useState<TeacherAck[] | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!email) return;
    const unsubs = [
      // Medical chain docs also carry facultyEmail (= the doctor's), so they
      // are filtered out here and shown in the doctor's section instead.
      subscribeToLeaveRequestsForFaculty(email, (apps) => setCasual(apps.filter((a) => a.type !== "medical" || !a.stage))),
      subscribeToMedicalLeavesFor("doctor", email, setAsDoctor),
      subscribeToMedicalLeavesFor("hod", email, setAsHod),
      subscribeToMyTeacherAcks(email, setAcks),
    ];
    return () => unsubs.forEach((u) => u());
  }, [email]);

  const loading = casual === null || asDoctor === null || asHod === null || acks === null;

  const pendingDoctor = useMemo(() => (asDoctor ?? []).filter((a) => a.stage === "doctor"), [asDoctor]);
  const pendingHod = useMemo(() => (asHod ?? []).filter((a) => a.stage === "hod"), [asHod]);
  const pendingAcks = useMemo(() => (acks ?? []).filter((a) => a.status === "pending"), [acks]);
  const pendingCasual = useMemo(() => (casual ?? []).filter((a) => a.status === "pending"), [casual]);

  const setRemark = (id: string, text: string) => setRemarks((prev) => ({ ...prev, [id]: text }));

  const decideMedical = (app: LeaveApplication, role: "doctor" | "hod", decision: "approved" | "rejected") => {
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
          appId: app.id,
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
    const next = role === "doctor" ? `${app.hodName ?? "the HOD"} for approval` : "the student's teachers";
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

  const confirmAck = (ack: TeacherAck) => {
    if (!profile?.uid) return;
    const key = ack.leaveId + ack.id;
    Alert.alert(
      "Classes excused?",
      `Confirm you've marked ${ack.studentName}'s attendance as excused for the classes listed.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setBusyId(key);
            try {
              await confirmTeacherAck({
                leaveId: ack.leaveId,
                teacherEmail: ack.id,
                uid: profile.uid,
                remark: remarks[key],
              });
            } catch (err: any) {
              Alert.alert("Couldn't confirm", err.message ?? "Please try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
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

  const renderMedicalCard = (app: LeaveApplication, role: "doctor" | "hod") => (
    <View key={`${role}-${app.id}`} style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.studentName}>{app.studentName}</Text>
        <View style={[styles.statusPill, { backgroundColor: colors.warning + "20" }]}>
          <Text style={[styles.statusPillText, { color: colors.warning }]}>
            {role === "doctor" ? "Step 1 · Doctor" : "Step 2 · HOD"}
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
      {role === "hod" && app.doctorDecision && (
        <View style={styles.priorStep}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.priorStepText}>
            Approved by {app.doctorDecision.byName}
            {app.doctorDecision.remark ? `: "${app.doctorDecision.remark}"` : ""}
          </Text>
        </View>
      )}
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
          <Text style={styles.approveButtonText}>{role === "doctor" ? "Approve → HOD" : "Approve → Teachers"}</Text>
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

  const renderAckCard = (ack: TeacherAck) => {
    const key = ack.leaveId + ack.id;
    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.studentName}>{ack.studentName}</Text>
          <View style={[styles.statusPill, { backgroundColor: colors.success + "20" }]}>
            <Text style={[styles.statusPillText, { color: colors.success }]}>Medical · approved</Text>
          </View>
        </View>
        {ack.studentEnrollmentNumber && <Text style={styles.meta}>{ack.studentEnrollmentNumber}</Text>}
        <Text style={styles.meta}>
          On approved medical leave {prettyDate(ack.fromDate)} → {prettyDate(ack.toDate)}
        </Text>
        <Text style={styles.ackLead}>Your classes they missed:</Text>
        {ack.subjects.map((s) => (
          <View key={s.code} style={styles.subjectRow}>
            <Text style={styles.subjectName}>
              {s.name} <Text style={styles.subjectCode}>({s.code})</Text>
            </Text>
            <Text style={styles.subjectDates}>{s.dates.map(prettyDate).join(" · ")}</Text>
          </View>
        ))}
        <TextInput
          style={styles.remarkInput}
          value={remarks[key] ?? ""}
          onChangeText={(t) => setRemark(key, t)}
          placeholder="Optional note"
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton, { marginTop: spacing.sm }]}
          disabled={busyId === key}
          onPress={() => confirmAck(ack)}
        >
          <Text style={styles.approveButtonText}>Mark these classes excused</Text>
        </TouchableOpacity>
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

  // Compact rows for things already handled.
  const historyRows = useMemo(() => {
    type Row = { key: string; title: string; detail: string; ok: boolean };
    const rows: Row[] = [];
    for (const a of asDoctor ?? []) {
      if (a.stage === "doctor") continue;
      const ok = a.doctorDecision?.decision !== "rejected";
      rows.push({ key: `d-${a.id}`, title: a.studentName, detail: `Medical ${a.fromDate} → ${a.toDate} · you ${ok ? "approved" : "rejected"}`, ok });
    }
    for (const a of asHod ?? []) {
      if (a.stage === "hod" || a.stage === "doctor") continue;
      const ok = a.hodDecision?.decision !== "rejected";
      rows.push({ key: `h-${a.id}`, title: a.studentName, detail: `Medical ${a.fromDate} → ${a.toDate} · you ${ok ? "approved" : "rejected"} as HOD`, ok });
    }
    for (const k of acks ?? []) {
      if (k.status !== "confirmed") continue;
      rows.push({ key: `t-${k.leaveId}-${k.id}`, title: k.studentName, detail: `Medical ${k.fromDate} → ${k.toDate} · classes excused`, ok: true });
    }
    for (const c of casual ?? []) {
      if (c.status === "pending") continue;
      rows.push({ key: `c-${c.id}`, title: c.studentName, detail: `Casual ${c.fromDate} → ${c.toDate} · ${c.status}`, ok: c.status === "approved" });
    }
    return rows;
  }, [asDoctor, asHod, acks, casual]);

  const nothingPending = pendingDoctor.length + pendingHod.length + pendingAcks.length + pendingCasual.length === 0;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Leave Requests</Text>

          {loading ? (
            <LoadingSpinner style={{ marginTop: spacing.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {pendingDoctor.length > 0 && (
                <>
                  <SectionTitle icon="medkit-outline" title="Medical leaves to check" count={pendingDoctor.length} />
                  {pendingDoctor.map((a) => renderMedicalCard(a, "doctor"))}
                </>
              )}
              {pendingHod.length > 0 && (
                <>
                  <SectionTitle icon="shield-checkmark-outline" title="Approve as HOD" count={pendingHod.length} />
                  {pendingHod.map((a) => renderMedicalCard(a, "hod"))}
                </>
              )}
              {pendingAcks.length > 0 && (
                <>
                  <SectionTitle icon="calendar-outline" title="Excuse missed classes" count={pendingAcks.length} />
                  {pendingAcks.map(renderAckCard)}
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
            </ScrollView>
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
