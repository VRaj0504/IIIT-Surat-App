import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { colors, radius, spacing } from "../../theme/theme";
import { Card, PrimaryButton, Timeline, dateRange, ui } from "../ui";
import {
  MedicalAttachment,
  MedicalRequest,
  MedicalSignRole,
  ROLE_TITLE,
  SignatureVector,
  actMedical,
  isClosed,
  loadMySignature,
  removeMedicalFile,
  rolesFor,
  uploadMedicalFile,
} from "../../firebase/medicalService";
import { Attachments, Downloads, Flags, FormSummary, History, SignBlocks, StagePill, medicalTimeline } from "./MedicalDetails";
import SignaturePad from "./SignaturePad";

function Head({ r, title, sub }: { r: MedicalRequest; title: string; sub: string }) {
  return (
    <View style={s.head}>
      <View style={s.icon}>
        <Ionicons name="medkit-outline" size={18} color={colors.badge.pink.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <StagePill r={r} />
    </View>
  );
}

function Toggle({ open, onPress, label }: { open: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={s.toggle} accessibilityRole="button">
      <Text style={s.toggleText}>{label}</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
    </Pressable>
  );
}

export function MedicalTrackCard({ r, onEdit }: { r: MedicalRequest; onEdit: (r: MedicalRequest) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const withdraw = () =>
    Alert.alert("Withdraw this application?", "It will be closed and can't be reopened. You can apply again for other dates.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await actMedical({ leaveId: r.id, action: "withdraw" });
          } catch (e: any) {
            Alert.alert("Couldn't withdraw", e?.message ?? "Try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <Card style={s.card}>
      <Head r={r} title="Medical leave" sub={`${r.refNo ? `${r.refNo} · ` : ""}${dateRange(r.fromDate, r.toDate)}`} />
      <Flags r={r} />
      <Text style={s.reason}>{r.reason}</Text>
      {r.stage === "returned" ? (
        <View style={s.returned}>
          <Text style={s.returnedTitle}>Returned by the {r.returnedBy ?? "office"}</Text>
          <Text style={s.returnedText}>{r.returnNote}</Text>
          <PrimaryButton label="Fix and resubmit" icon="create-outline" onPress={() => onEdit(r)} style={{ marginTop: spacing.sm }} />
        </View>
      ) : null}
      <Timeline steps={medicalTimeline(r)} />
      <Downloads r={r} />
      <Toggle open={open} onPress={() => setOpen((v) => !v)} label={open ? "Hide form and history" : "Form, documents and history"} />
      {open ? (
        <View style={{ gap: spacing.md }}>
          <FormSummary r={r} />
          <Attachments r={r} />
          <SignBlocks r={r} />
          <History leaveId={r.id} />
        </View>
      ) : null}
      {!isClosed(r) ? (
        <TouchableOpacity onPress={withdraw} disabled={busy} style={s.withdraw}>
          {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={s.withdrawText}>Withdraw application</Text>}
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

export function MedicalReviewCard({ r, me }: { r: MedicalRequest; me: { uid: string; email: string; name: string } }) {
  const email = me.email.toLowerCase();
  const isOffice = r.stage === "office" && r.officeEmail === email;
  const roles = rolesFor(r, email);
  const canAct = isOffice || roles.length > 0;
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<MedicalSignRole | null>(roles[0] ?? null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [sig, setSig] = useState<SignatureVector | null>(null);
  const [remember, setRemember] = useState(true);
  const [certs, setCerts] = useState<MedicalAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (roles.length && !sig) loadMySignature(me.uid).then((v) => v && setSig(v));
  }, [roles.length, me.uid]);
  useEffect(() => {
    if (role && !roles.includes(role)) setRole(roles[0] ?? null);
  }, [roles.join(","), role]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      setNote("");
      setComment("");
      setCerts([]);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const forward = () =>
    Alert.alert("Forward to the Medical Officer?", `${r.medicalName ?? "The Medical Officer"} will verify the reports.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Forward", onPress: () => run("forward", () => actMedical({ leaveId: r.id, action: "forward", note: note.trim() || undefined })) },
    ]);

  const ret = () => {
    if (note.trim().length < 5) {
      Alert.alert("Add a note", "Tell the student what to fix or add.");
      return;
    }
    Alert.alert("Return to the student?", "They can fix it and resubmit.", [
      { text: "Cancel", style: "cancel" },
      { text: "Return", onPress: () => run("return", () => actMedical({ leaveId: r.id, action: "return", note: note.trim() })) },
    ]);
  };

  const sign = (decision: "approved" | "not_approved") => {
    if (!role) return;
    if (!sig) {
      Alert.alert("Sign first", "Draw your signature in the box.");
      return;
    }
    if (decision === "not_approved" && comment.trim().length < 3) {
      Alert.alert("Add a comment", "Say why it isn't approved. It is printed on the form.");
      return;
    }
    const what =
      role === "medical"
        ? decision === "approved"
          ? "It goes to the HOD, Associate Dean and Joint Registrar."
          : "The request will be closed as not approved."
        : "Your stamp, comment and signature go on the official form.";
    Alert.alert(decision === "approved" ? `Approve as ${ROLE_TITLE[role]}?` : `Not approve as ${ROLE_TITLE[role]}?`, what, [
      { text: "Cancel", style: "cancel" },
      {
        text: decision === "approved" ? "Approve and sign" : "Not approve",
        style: decision === "approved" ? "default" : "destructive",
        onPress: () =>
          run(decision, () =>
            actMedical({ leaveId: r.id, action: "sign", role, decision, comment: comment.trim() || undefined, signature: sig, saveSignature: remember, attachments: certs }),
          ),
      },
    ]);
  };

  const addCert = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setUploading(true);
    try {
      const att = await uploadMedicalFile({
        studentUid: r.studentUid,
        leaveId: r.id,
        folder: "medical",
        kind: "certificate",
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType,
        file: (a as unknown as { file?: Blob }).file ?? null,
      });
      setCerts((p) => [...p, att]);
    } catch (e: any) {
      Alert.alert("Couldn't attach", e?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card style={s.card}>
      <Head r={r} title={`${r.studentName}`} sub={`${r.refNo ?? ""} · ${dateRange(r.fromDate, r.toDate)}`} />
      <Flags r={r} />
      <Text style={s.reason} numberOfLines={open ? undefined : 2}>{r.reason}</Text>
      <Toggle open={open} onPress={() => setOpen((v) => !v)} label={open ? "Hide details" : "View details: form, documents, signatures"} />
      {open ? (
        <View style={{ gap: spacing.md }}>
          <FormSummary r={r} />
          <Attachments r={r} />
          <Downloads r={r} />
          <SignBlocks r={r} />
          <History leaveId={r.id} />
        </View>
      ) : null}

      {isOffice ? (
        <View style={s.act}>
          <Text style={s.actTitle}>Office check</Text>
          <Text style={s.actHint}>Check the details, the 4-day rule and the enclosures. Forward it, or return it to the student with a note.</Text>
          <TextInput
            style={[ui.input, s.input]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (needed to return; optional to forward)"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={400}
          />
          <View style={s.row}>
            <PrimaryButton tone="secondary" label="Return" icon="return-down-back" onPress={ret} loading={busy === "return"} style={{ flex: 1 }} />
            <PrimaryButton label="Forward to MO" icon="arrow-forward" onPress={forward} loading={busy === "forward"} style={{ flex: 1.4 }} />
          </View>
        </View>
      ) : null}

      {role ? (
        <View style={s.act}>
          {roles.length > 1 ? (
            <View style={s.roleRow}>
              {roles.map((k) => (
                <Pressable key={k} onPress={() => setRole(k)} style={[s.roleChip, role === k && s.roleChipOn]}>
                  <Text style={[s.roleChipText, role === k && { color: colors.onPrimary }]}>{ROLE_TITLE[k]}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={s.actTitle}>Sign as {ROLE_TITLE[role]}</Text>
          <TextInput
            style={[ui.input, s.input]}
            value={comment}
            onChangeText={setComment}
            placeholder={role === "medical" ? "Comment, e.g. Reports verified. Rest advised." : "Comment (needed if not approved)"}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={400}
          />
          {role === "medical" ? (
            <View style={{ gap: 6 }}>
              {certs.map((c) => (
                <View key={c.id} style={s.cert}>
                  <Ionicons name="document-attach" size={16} color={colors.success} />
                  <Text style={s.certName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setCerts((p) => p.filter((x) => x.id !== c.id));
                      removeMedicalFile(c.path);
                    }}
                  >
                    <Ionicons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addCert} onPress={addCert} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
                <Text style={s.addCertText}>Attach verified medical certificate (optional)</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <SignaturePad value={sig} onChange={setSig} />
          <View style={s.remember}>
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: colors.primary, false: colors.border }} />
            <Text style={s.rememberText}>Remember my signature</Text>
          </View>
          <View style={s.row}>
            <PrimaryButton tone="danger" label="Not approve" icon="close" onPress={() => sign("not_approved")} loading={busy === "not_approved"} style={{ flex: 1 }} />
            <PrimaryButton tone="success" label="Approve & sign" icon="checkmark" onPress={() => sign("approved")} loading={busy === "approved"} style={{ flex: 1 }} />
          </View>
          {role === "medical" ? (
            <TouchableOpacity
              onPress={() => {
                if (comment.trim().length < 5) {
                  Alert.alert("Say what's missing", "Write in the comment box what the student should add, then tap this again.");
                  return;
                }
                Alert.alert("Return to the student?", "They can add documents and resubmit. It goes back through the office.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Return", onPress: () => run("return", () => actMedical({ leaveId: r.id, action: "return", note: comment.trim() })) },
                ]);
              }}
              style={{ alignSelf: "center", padding: 8 }}
            >
              <Text style={s.link}>Need more documents? Return to student</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.badge.pink.bg, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  reason: { fontSize: 14, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 20 },
  returned: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  returnedTitle: { fontSize: 13, fontWeight: "800", color: colors.warning },
  returnedText: { fontSize: 14, color: colors.warningText, marginTop: 2 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 10 },
  toggleText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  withdraw: { alignSelf: "flex-start", paddingVertical: 8, marginTop: 4 },
  withdrawText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  act: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  actTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  actHint: { fontSize: 13, color: colors.textSecondary },
  input: { minHeight: 64, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.sm },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  roleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
  cert: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successBg, borderRadius: radius.md, padding: 8 },
  certName: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  addCert: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  addCertText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  rememberText: { fontSize: 13, color: colors.textPrimary },
  link: { fontSize: 13, fontWeight: "700", color: colors.primary },
});
