import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../../theme/theme";
import { Timeline, TimelineStep, dateRange } from "../ui";
import { openSafeUrl } from "../../utils/safeLink";
import {
  KIND_LABEL,
  LATE_LIMIT_DAYS,
  MedicalEvent,
  MedicalRequest,
  MedicalSignRole,
  SIGNOFF_ROLES,
  ROLE_TITLE,
  STAGE_LABEL,
  actMedical,
  fileUrl,
  fmtStamp,
  nameOf,
  signOf,
  subscribeMedicalEvents,
} from "../../firebase/medicalService";
import { SignedBlock } from "./Stamp";

function prettyIso(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function stageTone(r: MedicalRequest): { bg: string; fg: string } {
  if (r.stage === "teachers" || r.stage === "done") return { bg: colors.successBg, fg: colors.successFg };
  if (r.stage === "rejected") return { bg: colors.dangerBg, fg: colors.danger };
  if (r.stage === "returned") return { bg: colors.warningBg, fg: colors.warning };
  if (r.stage === "withdrawn") return { bg: colors.surfaceAlt, fg: colors.textSecondary };
  return { bg: colors.badge.blue.bg, fg: colors.badge.blue.fg };
}

export function StagePill({ r }: { r: MedicalRequest }) {
  const t = stageTone(r);
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]}>{STAGE_LABEL[r.stage]}</Text>
    </View>
  );
}

export function medicalTimeline(r: MedicalRequest): TimelineStep[] {
  const steps: TimelineStep[] = [];
  steps.push({ title: "Submitted", detail: `${r.refNo ?? ""}${r.submittedAt ? ` · ${fmtStamp(r.submittedAt)}` : ""}`, state: "done" });
  const officeDone = !!r.officeReview && r.officeReview.action === "forwarded" && r.stage !== "office";
  steps.push(
    r.stage === "returned"
      ? { title: `Returned by the ${r.returnedBy ?? "office"}`, detail: "Fix it and resubmit", note: r.returnNote, state: "rejected" }
      : r.stage === "office"
        ? { title: "Academic Office is checking", detail: r.officeEmail, state: "current" }
        : { title: officeDone ? "Office forwarded" : "Academic Office", detail: r.officeReview?.byName ?? r.officeEmail, note: r.officeReview?.note, state: officeDone ? "done" : "todo" },
  );
  const sigStep = (role: MedicalSignRole, waiting: boolean): TimelineStep => {
    const sg = signOf(r, role);
    if (sg) return { title: `${ROLE_TITLE[role]} ${sg.decision === "approved" ? "approved" : "did not approve"}`, detail: sg.byName, note: sg.comment, state: sg.decision === "approved" ? "done" : "rejected" };
    return { title: waiting ? `Waiting for ${ROLE_TITLE[role]}` : ROLE_TITLE[role], detail: nameOf(r, role), state: waiting ? "current" : "todo" };
  };
  steps.push(sigStep("medical", r.stage === "medical"));
  for (const k of SIGNOFF_ROLES) steps.push(sigStep(k, r.stage === "signoff"));
  const ok = r.stage === "teachers" || r.stage === "done";
  steps.push({
    title: ok ? "Approved" : r.stage === "rejected" ? "Not approved" : r.stage === "withdrawn" ? "Withdrawn" : "Final decision",
    detail: ok ? r.teacherNote ?? "Classes in these dates count as present." : r.stage === "rejected" || r.stage === "withdrawn" ? fmtStamp(r.decidedAt) : "After all three sign",
    state: ok ? "done" : r.stage === "rejected" ? "rejected" : "todo",
  });
  return steps;
}

export function Flags({ r }: { r: MedicalRequest }) {
  const items = [
    r.late ? { bad: true, t: `LATE · ${r.daysAfterRejoining} days after rejoining (limit ${LATE_LIMIT_DAYS})` } : r.daysAfterRejoining != null ? { bad: false, t: `On time · ${r.daysAfterRejoining} day${r.daysAfterRejoining === 1 ? "" : "s"} after rejoining` } : null,
    r.intimationMissing ? { bad: true, t: "No intimation email attached" } : null,
    !r.intimationMissing && r.intimationLate ? { bad: true, t: "Intimation sent after 24 hours" } : null,
    (r.resubmissions ?? 0) > 0 ? { bad: false, t: `Resubmitted ${r.resubmissions}×` } : null,
  ].filter(Boolean) as { bad: boolean; t: string }[];
  if (!items.length) return null;
  return (
    <View style={s.flags}>
      {items.map((i) => (
        <View key={i.t} style={[s.flag, { backgroundColor: i.bad ? colors.dangerBg : colors.surfaceAlt }]}>
          <Text style={[s.flagText, { color: i.bad ? colors.danger : colors.textSecondary }]}>{i.t}</Text>
        </View>
      ))}
    </View>
  );
}

async function openPath(path: string) {
  try {
    await openSafeUrl(await fileUrl(path));
  } catch {
    Alert.alert("Couldn't open the file", "Check your connection and try again.");
  }
}

export function Downloads({ r }: { r: MedicalRequest }) {
  const [busy, setBusy] = useState(false);
  const final = ["teachers", "done", "rejected"].includes(r.stage);
  const rebuild = async () => {
    setBusy(true);
    try {
      await actMedical({ leaveId: r.id, action: "rebuild" });
    } catch (e: any) {
      Alert.alert("Couldn't build the PDF", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.dl}>
      {r.formPdfPath ? (
        <Pressable style={s.dlBtn} onPress={() => openPath(r.formPdfPath!)} accessibilityRole="button">
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={s.dlText}>{final ? "Signed form (PDF)" : "Current form (PDF)"}</Text>
        </Pressable>
      ) : null}
      {r.bundlePath ? (
        <Pressable style={s.dlBtn} onPress={() => openPath(r.bundlePath!)} accessibilityRole="button">
          <Ionicons name="albums-outline" size={16} color={colors.primary} />
          <Text style={s.dlText}>Full record bundle</Text>
        </Pressable>
      ) : null}
      {(!r.formPdfPath || (final && !r.bundlePath)) && r.refNo ? (
        <Pressable style={s.dlBtn} onPress={rebuild} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={16} color={colors.primary} />}
          <Text style={s.dlText}>Prepare PDF</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Attachments({ r }: { r: MedicalRequest }) {
  const list = r.attachments ?? [];
  if (!list.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {list.map((a) => (
        <Pressable key={a.id + a.path} style={s.att} onPress={() => openPath(a.path)} accessibilityRole="link">
          <Ionicons name={a.contentType === "application/pdf" ? "document-text" : "image"} size={16} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.attName} numberOfLines={1}>
              {a.name}
            </Text>
            <Text style={s.attMeta}>{KIND_LABEL[a.kind]}{a.byRole === "medical" ? " · added by Medical Officer" : ""}</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

export function FormSummary({ r }: { r: MedicalRequest }) {
  const year = r.yearOfStudy ? ["", "1st", "2nd", "3rd", "4th", "5th"][r.yearOfStudy] ?? `${r.yearOfStudy}th` : null;
  const rows: [string, string][] = [
    ["Reg. No.", r.studentEnrollmentNumber ?? "—"],
    ["Branch & Year", [r.branch, year ? `${year} Year` : null].filter(Boolean).join(", ") || "—"],
    ["Semester", r.semester ? String(r.semester) : "—"],
    ["CGPA", r.cgpa || "—"],
    ["Absent", dateRange(r.fromDate, r.toDate)],
    ["Rejoined", prettyIso(r.rejoinedOn)],
    ["Intimation", r.intimationSent ? `Sent ${prettyIso(r.intimationDate)}` : "Not sent"],
    ["HOD", `${r.hodName ?? ""}${r.hodDepartment ? ` · ${r.hodDepartment}` : ""}`],
  ];
  return (
    <View style={s.sum}>
      {rows.map(([k, v]) => (
        <View key={k} style={s.sumCell}>
          <Text style={s.sumK}>{k}</Text>
          <Text style={s.sumV}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function SignBlocks({ r }: { r: MedicalRequest }) {
  return (
    <View>
      {(["medical", ...SIGNOFF_ROLES] as MedicalSignRole[]).map((k) => (
        <SignedBlock key={k} title={ROLE_TITLE[k]} name={nameOf(r, k)} sign={signOf(r, k)} />
      ))}
    </View>
  );
}

export function History({ leaveId }: { leaveId: string }) {
  const [events, setEvents] = useState<MedicalEvent[] | null>(null);
  useEffect(() => subscribeMedicalEvents(leaveId, setEvents), [leaveId]);
  if (events === null) return <ActivityIndicator color={colors.primary} />;
  return (
    <View style={{ gap: 8 }}>
      {events.map((e) => (
        <View key={e.id} style={s.ev}>
          <View style={[s.evDot, { backgroundColor: e.decision === "not_approved" ? colors.danger : e.decision === "approved" ? colors.success : colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.evTitle}>
              {e.action} <Text style={s.evBy}>· {e.byName}{e.role ? ` (${e.role})` : ""}</Text>
            </Text>
            <Text style={s.evAt}>{fmtStamp(e.at)}</Text>
            {e.note ? <Text style={s.evNote}>“{e.note}”</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: "800" },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  flag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  flagText: { fontSize: 12, fontWeight: "700" },
  dl: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
  dlText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  att: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10 },
  attName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  attMeta: { fontSize: 11, color: colors.textSecondary },
  sum: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  sumCell: { flexGrow: 1, flexBasis: 130, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  sumK: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  sumV: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  ev: { flexDirection: "row", gap: 10 },
  evDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  evTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  evBy: { fontWeight: "500", color: colors.textSecondary },
  evAt: { fontSize: 11, color: colors.textSecondary },
  evNote: { fontSize: 12, color: colors.textPrimary, fontStyle: "italic", marginTop: 2 },
});
