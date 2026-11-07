import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Switch } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  actOnExcusal,
  respondToExcusal,
  subscribeToAssignedExcusals,
  subscribeToSignerExcusals,
  EventExcusal,
  SIGN_STEPS,
  STEP_TITLE,
  type SignStep,
} from "../firebase/eventExcusalService";
import { loadMySignature, type SignatureVector } from "../firebase/medicalService";
import LoadingSpinner from "../components/LoadingSpinner";
import { KeyboardAwareFlatList } from "../components/KeyboardAware";
import { EmptyState, PrimaryButton, Segmented } from "../components/ui";
import SignaturePad, { SignatureView } from "../components/medical/SignaturePad";
import ExcusalSteps from "../components/ExcusalSteps";
import { excusalWhen } from "./SubmitEventExcusalScreen";

function StudentList({ x }: { x: EventExcusal }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = x.students ?? x.studentEnrollmentNumbers.map((r) => ({ regNo: r, name: "", branch: "", section: null }));
  const term = q.trim().toLowerCase();
  const shown = term ? list.filter((s) => `${s.regNo} ${s.name}`.toLowerCase().includes(term)) : list;
  const byClass = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((s) => {
      const sec = s.section && s.section !== s.branch ? s.section : null;
      const k = (sec && sec.toUpperCase().includes(s.branch.toUpperCase()) ? sec : [s.branch, sec].filter(Boolean).join(" ")) || "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([k, n]) => `${k}: ${n}`).join(" · ");
  }, [list]);
  return (
    <View style={s.students}>
      <TouchableOpacity style={s.studentsHead} onPress={() => setOpen((v) => !v)}>
        <Ionicons name="people-outline" size={16} color={colors.primary} />
        <Text style={s.studentsTitle}>{list.length} students</Text>
        <Text style={s.studentsSub} numberOfLines={1}>
          {byClass}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      {open && (
        <>
          {list.length > 8 && (
            <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Search students" placeholderTextColor={colors.textSecondary} autoCorrect={false} />
          )}
          {shown.map((st) => (
            <View key={st.regNo} style={s.studentRow}>
              <Text style={s.studentName} numberOfLines={1}>
                {st.name || st.regNo}
              </Text>
              <Text style={s.studentMeta}>
                {st.regNo}
                {st.branch ? ` · ${st.branch}${st.section && st.section !== st.branch ? ` ${st.section}` : ""}` : ""}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SignedBy({ x }: { x: EventExcusal }) {
  const done = SIGN_STEPS.filter((k) => x.signatures?.[k]);
  if (!done.length) return null;
  return (
    <View style={s.signedWrap}>
      {done.map((k) => {
        const sg = x.signatures![k]!;
        return (
          <View key={k} style={s.signed}>
            <Text style={s.signedTitle}>{STEP_TITLE[k]}</Text>
            {sg.signature ? <SignatureView sig={sg.signature} height={36} width={110} /> : null}
            <Text style={s.signedName} numberOfLines={1}>
              {sg.name}
            </Text>
            {sg.remark ? <Text style={s.signedRemark}>“{sg.remark}”</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function SignBox({ x, uid, onDone }: { x: EventExcusal; uid: string; onDone: () => void }) {
  const [sig, setSig] = useState<SignatureVector | null>(null);
  const [remember, setRemember] = useState(true);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<null | "sign" | "reject">(null);
  const step = x.stage as SignStep;
  useEffect(() => {
    loadMySignature(uid).then((v) => v && setSig(v));
  }, [uid]);

  const run = async (action: "sign" | "reject") => {
    setBusy(action);
    try {
      await actOnExcusal({ excusalId: x.id, action, signature: action === "sign" ? sig : null, saveSignature: remember, remark: remark.trim() || undefined });
      onDone();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };
  const approve = () => {
    if (!sig) return Alert.alert("Sign first", "Draw your signature in the box.");
    const last = step === "dean";
    Alert.alert(
      `Sign as ${STEP_TITLE[step]}?`,
      last ? `This approves it. Attendance updates for all ${x.studentEnrollmentNumbers.length} students.` : `It goes to ${STEP_TITLE[SIGN_STEPS[SIGN_STEPS.indexOf(step) + 1]]} next.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign", onPress: () => run("sign") },
      ],
    );
  };
  const reject = () => {
    if (remark.trim().length < 3) return Alert.alert("Add a reason", "Say why it's rejected. The club lead sees it.");
    Alert.alert("Reject this request?", "The club lead can fix it and send it again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => run("reject") },
    ]);
  };

  return (
    <View style={{ marginTop: spacing.sm, gap: 8 }}>
      <TextInput
        style={s.search}
        value={remark}
        onChangeText={setRemark}
        placeholder="Remark (needed to reject)"
        placeholderTextColor={colors.textSecondary}
      />
      <SignaturePad value={sig} onChange={setSig} />
      <View style={s.remember}>
        <Switch value={remember} onValueChange={setRemember} trackColor={{ true: colors.primary, false: colors.border }} />
        <Text style={s.rememberText}>Remember my signature</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PrimaryButton tone="danger" label="Reject" icon="close" onPress={reject} loading={busy === "reject"} style={{ flex: 1 }} />
        <PrimaryButton tone="success" label="Sign" icon="checkmark" onPress={approve} loading={busy === "sign"} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function OldCard({ x }: { x: EventExcusal }) {
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (status: "approved" | "rejected") => {
    setBusy(true);
    try {
      await respondToExcusal(x.id, status, remark.trim() || null);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: spacing.sm, gap: 8 }}>
      <Text style={s.meta}>Sent before the 3-signature process. You can still finish it.</Text>
      <TextInput style={s.search} value={remark} onChangeText={setRemark} placeholder="Optional remark" placeholderTextColor={colors.textSecondary} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PrimaryButton tone="danger" label="Reject" onPress={() => go("rejected")} loading={busy} style={{ flex: 1 }} />
        <PrimaryButton tone="success" label="Approve" onPress={() => go("approved")} loading={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export default function EventExcusalRequestsScreen() {
  const { profile } = useAuth();
  const email = (profile?.email ?? "").toLowerCase();
  const [v2, setV2] = useState<EventExcusal[] | null>(null);
  const [v1, setV1] = useState<EventExcusal[]>([]);
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    return subscribeToSignerExcusals(email, setV2);
  }, [email]);
  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeToAssignedExcusals(profile.uid, (l) => setV1(l.filter((x) => x.flow !== 2)));
  }, [profile?.uid]);

  const all = useMemo(() => [...(v2 ?? []), ...v1], [v2, v1]);
  const mineNow = (x: EventExcusal) => (x.flow === 2 ? x.status === "pending" && (x.currentApproverEmail ?? "") === email : x.status === "pending");
  const waiting = all.filter(mineNow);
  const done = all.filter((x) => !mineNow(x));
  const shown = tab === "waiting" ? waiting : done;

  if (v2 === null) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <View style={s.page}>
      <KeyboardAwareFlatList
        data={shown}
        keyExtractor={(x) => x.id}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Segmented
              options={[
                { value: "waiting", label: "Waiting for you", badge: waiting.length || undefined },
                { value: "done", label: "Others & done" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            title={tab === "waiting" ? "Nothing to sign" : "Nothing here yet"}
            hint={tab === "waiting" ? "Event excusals that need your signature show up here, and you get a notification." : undefined}
          />
        }
        renderItem={({ item: x }) => {
          const canAct = mineNow(x);
          const open = openId === x.id || (canAct && waiting.length === 1);
          return (
            <View style={s.card}>
              <TouchableOpacity onPress={() => setOpenId(openId === x.id ? null : x.id)} activeOpacity={0.8}>
                <Text style={s.kicker}>
                  {[x.category, x.parentClubName && x.clubName !== x.parentClubName ? `${x.clubName} · ${x.parentClubName}` : x.clubName].filter(Boolean).join(" · ") || "Event"}
                </Text>
                <Text style={s.title}>{x.eventName}</Text>
                <Text style={s.meta}>{excusalWhen(x)}</Text>
                <Text style={s.meta}>Sent by {x.submittedByName}</Text>
                {x.flow === 2 ? <ExcusalSteps x={x} /> : null}
                {x.status !== "pending" && (
                  <Text style={[s.meta, { fontWeight: "800", color: x.status === "approved" ? colors.successFg : colors.danger }]}>
                    {x.status === "approved" ? "Approved" : x.status === "withdrawn" ? "Withdrawn by the club" : `Rejected${x.rejectedReason || x.facultyRemark ? `: ${x.rejectedReason || x.facultyRemark}` : ""}`}
                  </Text>
                )}
              </TouchableOpacity>
              <StudentList x={x} />
              {open && x.flow === 2 && <SignedBy x={x} />}
              {canAct && (open ? x.flow === 2 ? <SignBox x={x} uid={profile!.uid} onDone={() => setOpenId(null)} /> : <OldCard x={x} /> : (
                <PrimaryButton label="Review & sign" icon="create-outline" onPress={() => setOpenId(x.id)} style={{ marginTop: spacing.sm }} />
              ))}
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  kicker: { fontSize: 11.5, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { ...typography.h3, color: colors.textPrimary, marginTop: 2 },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  students: { marginTop: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10 },
  studentsHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  studentsTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  studentsSub: { flex: 1, fontSize: 12, color: colors.textSecondary },
  studentRow: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  studentName: { fontSize: 13.5, fontWeight: "700", color: colors.textPrimary },
  studentMeta: { fontSize: 12, color: colors.textSecondary },
  search: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginVertical: 6,
  },
  signedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  signed: { backgroundColor: colors.successBg, borderRadius: radius.md, padding: 8, minWidth: 120 },
  signedTitle: { fontSize: 11, fontWeight: "800", color: colors.successFg },
  signedName: { fontSize: 12.5, fontWeight: "700", color: colors.textPrimary },
  signedRemark: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic" },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  rememberText: { fontSize: 13, color: colors.textPrimary },
});
