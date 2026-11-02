import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Linking } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius } from "../theme/theme";
import { Card, EmptyState, PrimaryButton, Segmented, StatusPill, Timeline, TimelineStep, dateRange, ui } from "../components/ui";
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
  APPROVER_ROLES,
  ApproverRole,
  LeaveApplication,
  TeacherAck,
} from "../firebase/leaveService";
import { MedicalRequest, subscribeMedicalQueue, subscribeMedicalRecords } from "../firebase/medicalService";
import { MedicalReviewCard } from "../components/medical/MedicalCards";

const ROLES: ApproverRole[] = APPROVER_ROLES;

const ROLE_SECTION: Record<ApproverRole, { icon: keyof typeof Ionicons.glyphMap; title: string }> = {
  doctor: { icon: "medkit-outline", title: "Medical leaves to check" },
  hod: { icon: "shield-checkmark-outline", title: "Approve as HOD" },
  dean: { icon: "ribbon-outline", title: "Approve as Dean" },
  jr: { icon: "document-text-outline", title: "Approve as Joint Registrar" },
  administrator: { icon: "briefcase-outline", title: "Approve as Administrator" },
};

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
import { KeyboardAwareScrollView } from "../components/KeyboardAware";

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function openReport(url?: string | null) {
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open the report"));
}

function SectionTitle({ icon, title, count }: { icon: keyof typeof Ionicons.glyphMap; title: string; count: number }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function StudentHead({ name, reg, right }: { name: string; reg?: string | null; right?: React.ReactNode }) {
  return (
    <View style={styles.headRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.studentName} numberOfLines={1}>
          {name}
        </Text>
        {reg ? <Text style={styles.meta}>{reg}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default function LeaveRequestsScreen() {
  const { profile } = useAuth();
  const email = profile?.email?.toLowerCase() ?? "";
  const [casual, setCasual] = useState<LeaveApplication[] | null>(null);
  const [byRole, setByRole] = useState<Record<ApproverRole, LeaveApplication[] | null>>({
    doctor: null,
    hod: null,
    dean: null,
    jr: null,
    administrator: null,
  });
  const [acks, setAcks] = useState<TeacherAck[] | null>(null);
  const [declinedDraft, setDeclinedDraft] = useState<Record<string, string[]>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [medQueue, setMedQueue] = useState<MedicalRequest[] | null>(null);
  const [medRecords, setMedRecords] = useState<MedicalRequest[]>([]);

  useEffect(() => {
    if (!email) return;
    const unsubs = [

      subscribeToLeaveRequestsForFaculty(email, (apps) => setCasual(apps.filter((a) => a.type !== "medical" || !a.stage))),
      ...ROLES.map((role) =>
        subscribeToMedicalLeavesFor(role, email, (apps) => setByRole((prev) => ({ ...prev, [role]: apps }))),
      ),
      subscribeToMyTeacherAcks(email, setAcks),
      subscribeMedicalQueue(email, setMedQueue, () => setMedQueue([])),
      subscribeMedicalRecords(email, setMedRecords),
    ];
    return () => unsubs.forEach((u) => u());
  }, [email]);

  const loading = casual === null || ROLES.some((r) => byRole[r] === null) || acks === null || medQueue === null;
  const me = profile ? { uid: profile.uid, email, name: profile.name } : null;
  const medHandled = useMemo(() => {
    const q = new Set((medQueue ?? []).map((r) => r.id));
    return medRecords.filter((r) => !q.has(r.id));
  }, [medQueue, medRecords]);

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
    const prior: TimelineStep[] = chain.slice(0, chain.indexOf(role)).flatMap((r) => {
      const d = app[`${r}Decision` as const];
      return d ? [{ title: `${APPROVER_LABEL[r]} approved`, detail: d.byName, note: d.remark, state: "done" as const }] : [];
    });
    return (
      <Card key={`${role}-${app.id}`} style={styles.card}>
        <StudentHead
          name={app.studentName}
          reg={app.studentEnrollmentNumber}
          right={<StatusPill status="info" label={`Step ${step}/${chain.length}`} />}
        />
        <View style={styles.dateChip}>
          <Ionicons name="calendar-outline" size={14} color={colors.badge.pink.fg} />
          <Text style={styles.dateChipText}>{dateRange(app.fromDate, app.toDate)}</Text>
        </View>
        <Text style={styles.reason}>{app.reason}</Text>
        {app.medicalReportUrl ? (
          <TouchableOpacity onPress={() => openReport(app.medicalReportUrl)} style={styles.reportButton}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.reportButtonText}>Open medical report</Text>
            <Ionicons name="open-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
        {prior.length > 0 && <Timeline steps={prior} />}
        <TextInput
          style={[ui.input, styles.remark]}
          value={remarks[app.id] ?? ""}
          onChangeText={(t) => setRemark(app.id, t)}
          placeholder="Remark (needed if you reject)"
          placeholderTextColor={colors.textSecondary}
        />
        <View style={styles.actionRow}>
          <PrimaryButton
            tone="danger"
            label="Reject"
            icon="close"
            style={styles.actionBtn}
            loading={busyId === app.id}
            onPress={() => decideMedical(app, role, "rejected")}
          />
          <PrimaryButton
            tone="success"
            label={nextStage === "teachers" ? "Final approve" : "Approve"}
            icon="checkmark"
            style={[styles.actionBtn, { flex: 1.4 }]}
            loading={busyId === app.id}
            onPress={() => decideMedical(app, role, "approved")}
          />
        </View>
        <Text style={styles.nextHint}>
          {nextStage === "teachers"
            ? "Approving makes the student's classes in these dates count as present."
            : `Next: ${APPROVER_LABEL[nextStage as ApproverRole]} · ${approverName(nextStage as ApproverRole, app)}`}
        </Text>
      </Card>
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
      <Card key={key} style={styles.card}>
        <StudentHead
          name={ack.studentName}
          reg={ack.studentEnrollmentNumber}
          right={
            <StatusPill
              status={allDeclined ? "rejected" : ack.status === "pending" ? "pending" : "approved"}
              label={allDeclined ? "Not excused" : ack.status === "pending" ? "Your call" : `${excusedCount}/${total} excused`}
            />
          }
        />
        <View style={styles.dateChip}>
          <Ionicons name="medkit-outline" size={14} color={colors.badge.pink.fg} />
          <Text style={styles.dateChipText}>Medical leave · {dateRange(ack.fromDate, ack.toDate)}</Text>
        </View>
        <Text style={styles.ackLead}>These classes count as present. Tap a class to not excuse it.</Text>
        {ack.subjects.map((s) => (
          <View key={s.code} style={styles.subjectRow}>
            <Text style={styles.subjectName}>
              {s.name} <Text style={styles.subjectCode}>{s.code}</Text>
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
                    accessibilityLabel={`${s.name} ${prettyDate(d)} ${off ? "not excused" : "excused"}`}
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
          style={[ui.input, styles.remark]}
          value={remarks[key] ?? ack.remark ?? ""}
          onChangeText={(t) => setRemark(key, t)}
          placeholder="Optional note for the student"
          placeholderTextColor={colors.textSecondary}
        />
        <View style={styles.actionRow}>
          {allDeclined ? (
            <PrimaryButton
              tone="success"
              label="Excuse classes again"
              style={styles.actionBtn}
              loading={busyId === key}
              onPress={() => saveAck(ack, "excused")}
            />
          ) : (
            <>
              <PrimaryButton
                tone="danger"
                label="Excuse none"
                style={styles.actionBtn}
                loading={busyId === key}
                onPress={() =>
                  Alert.alert("Don't excuse any?", `None of ${ack.studentName}'s classes with you in these dates will count as present.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Don't excuse", style: "destructive", onPress: () => saveAck(ack, "declined") },
                  ])
                }
              />
              <PrimaryButton
                tone="success"
                label={ack.status === "pending" ? "Confirm" : "Save changes"}
                icon="checkmark"
                style={[styles.actionBtn, { flex: 1.4 }]}
                loading={busyId === key}
                disabled={!dirty && ack.status !== "pending" && remarks[key] === undefined}
                onPress={() => saveAck(ack, "excused")}
              />
            </>
          )}
        </View>
      </Card>
    );
  };

  const renderCasualCard = (item: LeaveApplication) => (
    <Card key={`casual-${item.id}`} style={styles.card}>
      <StudentHead name={item.studentName} reg={item.studentEnrollmentNumber} right={<StatusPill status={item.status} />} />
      <View style={[styles.dateChip, { backgroundColor: colors.badge.blue.bg }]}>
        <Ionicons name="calendar-outline" size={14} color={colors.badge.blue.fg} />
        <Text style={[styles.dateChipText, { color: colors.badge.blue.fg }]}>{dateRange(item.fromDate, item.toDate)}</Text>
      </View>
      <Text style={styles.reason}>{item.reason}</Text>
      <TextInput
        style={[ui.input, styles.remark]}
        value={remarks[item.id] ?? ""}
        onChangeText={(t) => setRemark(item.id, t)}
        placeholder="Optional remark"
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.actionRow}>
        <PrimaryButton
          tone="danger"
          label="Reject"
          icon="close"
          style={styles.actionBtn}
          loading={busyId === item.id}
          onPress={() => resolveCasual(item, "rejected")}
        />
        <PrimaryButton
          tone="success"
          label="Approve"
          icon="checkmark"
          style={[styles.actionBtn, { flex: 1.4 }]}
          loading={busyId === item.id}
          onPress={() => resolveCasual(item, "approved")}
        />
      </View>
    </Card>
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

  const todoCount = pendingApprovals + pendingAcks.length + pendingCasual.length + (medQueue?.length ?? 0);

  return (
    <View style={styles.screen}>
      {loading ? (
        <LoadingSpinner style={{ marginTop: spacing.xl }} />
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "todo", label: "To do", badge: todoCount || undefined },
              { value: "done", label: "Handled", badge: historyRows.length + recentAcks.length + medHandled.length || undefined },
            ]}
          />
          {tab === "todo" ? (
            <>
              {me && (medQueue ?? []).length > 0 && (
                <>
                  <SectionTitle icon="medkit-outline" title="Medical leave (official form)" count={medQueue!.length} />
                  {medQueue!.map((r) => (
                    <MedicalReviewCard key={r.id} r={r} me={me} />
                  ))}
                </>
              )}
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
              {pendingCasual.length > 0 && (
                <>
                  <SectionTitle icon="mail-open-outline" title="Casual leave" count={pendingCasual.length} />
                  {pendingCasual.map(renderCasualCard)}
                </>
              )}
              {todoCount === 0 && (
                <EmptyState icon="checkmark-done-outline" title="All caught up" hint="New leave requests will show up here." />
              )}
            </>
          ) : (
            <>
              {me && medHandled.length > 0 && (
                <>
                  <SectionTitle icon="folder-open-outline" title="Medical leave records" count={0} />
                  {medHandled.slice(0, 40).map((r) => (
                    <MedicalReviewCard key={r.id} r={r} me={me} />
                  ))}
                </>
              )}
              {recentAcks.length > 0 && (
                <>
                  <SectionTitle icon="medkit-outline" title="Medical leave in your classes" count={0} />
                  <Text style={styles.sectionHint}>You can still change which classes are excused.</Text>
                  {recentAcks.map(renderAckCard)}
                </>
              )}
              {historyRows.length > 0 && <SectionTitle icon="time-outline" title="Earlier" count={0} />}
              {historyRows.map((r) => (
                <View key={r.key} style={styles.historyRow}>
                  <Ionicons name={r.ok ? "checkmark-circle" : "close-circle"} size={20} color={r.ok ? colors.success : colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{r.title}</Text>
                    <Text style={styles.meta}>{r.detail}</Text>
                  </View>
                </View>
              ))}
              {historyRows.length + recentAcks.length + medHandled.length === 0 && (
                <EmptyState icon="time-outline" title="Nothing handled yet" hint="Leaves you approve or reject appear here." />
              )}
            </>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.badge.blue.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, flex: 1 },
  sectionHint: { fontSize: 12, color: colors.textSecondary, marginTop: -4, marginBottom: spacing.sm },
  countBadge: {
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
  },
  countBadgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  card: { marginBottom: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.badge.purple.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800", color: colors.badge.purple.fg },
  studentName: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.badge.pink.bg,
  },
  dateChipText: { fontSize: 12, fontWeight: "700", color: colors.badge.pink.fg },
  reason: { fontSize: 14, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 20 },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.badge.blue.bg,
  },
  reportButtonText: { color: colors.primary, fontWeight: "800", fontSize: 14, flex: 1 },
  remark: { marginTop: spacing.sm, minHeight: 44 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1, minHeight: 46 },
  nextHint: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
  ackLead: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, fontWeight: "600" },
  subjectRow: { marginTop: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm },
  subjectName: { fontSize: 14, color: colors.textPrimary, fontWeight: "700" },
  subjectCode: { fontWeight: "500", color: colors.textSecondary, fontSize: 12 },
  sessionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  sessionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    minHeight: 38,
  },
  sessionChipOn: { backgroundColor: colors.successBg },
  sessionChipOff: { backgroundColor: colors.dangerBg },
  sessionChipText: { fontSize: 12, fontWeight: "800" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  historyTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: "700" },
});
