import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { colors, radius, spacing } from "../../theme/theme";
import { UserProfile } from "../../context/AuthContext";
import DateField, { todayIso } from "../DateField";
import { Card, FieldLabel, PrimaryButton, Section, SelectField, SheetPicker, ui } from "../ui";
import { openSafeUrl } from "../../utils/safeLink";
import {
  AttachmentKind,
  KIND_LABEL,
  LATE_LIMIT_DAYS,
  MEDICAL_TEMPLATE_URL,
  MedicalAttachment,
  MedicalConfig,
  MedicalRequest,
  daysBetween,
  getMedicalConfig,
  hodChoices,
  medicalReady,
  newLeaveId,
  removeMedicalFile,
  submitMedical,
  uploadMedicalFile,
} from "../../firebase/medicalService";

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th"];

function semesterOn(admissionYear: number, iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  const odd = m >= 7;
  return (odd ? y - admissionYear : y - admissionYear - 1) * 2 + 1 + (odd ? 0 : 1);
}

function prettyIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function sizeLabel(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export default function MedicalApplyForm({
  profile,
  existing,
  onDone,
  onCancel,
}: {
  profile: UserProfile;
  existing?: MedicalRequest | null;
  onDone: (msg: string) => void;
  onCancel?: () => void;
}) {
  const [cfg, setCfg] = useState<MedicalConfig | null | undefined>(undefined);
  const [leaveId] = useState(() => existing?.id ?? newLeaveId());
  const [cgpa, setCgpa] = useState(existing?.cgpa ?? "");
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [fromDate, setFromDate] = useState(existing?.fromDate ?? "");
  const [toDate, setToDate] = useState(existing?.toDate ?? "");
  const [rejoinedOn, setRejoinedOn] = useState(existing?.rejoinedOn ?? "");
  const [intimationSent, setIntimationSent] = useState(existing?.intimationSent ?? false);
  const [intimationDate, setIntimationDate] = useState(existing?.intimationDate ?? "");
  const [hodEmail, setHodEmail] = useState(existing?.hodEmail ?? "");
  const [hodOpen, setHodOpen] = useState(false);
  const [files, setFiles] = useState<MedicalAttachment[]>(() => (existing?.attachments ?? []).filter((a) => a.byRole !== "medical"));
  const [uploading, setUploading] = useState<AttachmentKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRules, setShowRules] = useState(!existing);
  const today = todayIso();

  useEffect(() => {
    getMedicalConfig().then(setCfg).catch(() => setCfg(null));
  }, []);

  const hods = useMemo(() => hodChoices(cfg), [cfg]);
  useEffect(() => {
    if (hodEmail || hods.length === 0) return;
    const b = (profile.branch ?? "").toUpperCase();
    const mine = hods.find((h) => h.department.toUpperCase() === b);
    if (mine) setHodEmail(mine.email);
  }, [hods, profile.branch, hodEmail]);
  const hod = hods.find((h) => h.email === hodEmail) ?? null;

  const sem = profile.admissionYear ? semesterOn(profile.admissionYear, fromDate || today) : null;
  const year = sem ? Math.ceil(sem / 2) : null;
  const days = fromDate && toDate ? daysBetween(fromDate, toDate) + 1 : 0;
  const lateBy = rejoinedOn ? daysBetween(rejoinedOn, today) : 0;
  const late = !!rejoinedOn && lateBy > LATE_LIMIT_DAYS;
  const intimationLate = intimationSent && !!intimationDate && !!fromDate && daysBetween(fromDate, intimationDate) > 1;
  const reports = files.filter((f) => f.kind === "report");
  const intimations = files.filter((f) => f.kind === "intimation");

  const pick = async (kind: AttachmentKind) => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: true });
    if (res.canceled || !res.assets?.length) return;
    if (files.length + res.assets.length > 8) {
      Alert.alert("Too many files", "Attach at most 8 files in total.");
      return;
    }
    setUploading(kind);
    try {
      for (const a of res.assets) {
        const att = await uploadMedicalFile({
          studentUid: profile.uid,
          leaveId,
          folder: "student",
          kind,
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType,
          file: (a as unknown as { file?: Blob }).file ?? null,
        });
        setFiles((prev) => [...prev, { ...att, byRole: "student" }]);
      }
    } catch (e: any) {
      Alert.alert("Couldn't attach", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  };

  const remove = (f: MedicalAttachment) => {
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    if (!existing?.attachments?.some((x) => x.path === f.path)) removeMedicalFile(f.path);
  };

  const submit = async () => {
    const problems: string[] = [];
    if (!fromDate || !toDate) problems.push("Pick the first and last day you were absent.");
    if (fromDate && toDate && toDate < fromDate) problems.push("The last day can't be before the first day.");
    if (!rejoinedOn) problems.push("Pick the date you rejoined.");
    if (rejoinedOn && toDate && rejoinedOn <= toDate) problems.push("You must rejoin after the last day of absence.");
    if (reason.trim().length < 10) problems.push("Describe the medical reason in a sentence.");
    if (cgpa && !(/^\d{1,2}(\.\d{1,2})?$/.test(cgpa) && Number(cgpa) <= 10)) problems.push("CGPA must be a number from 0 to 10.");
    if (!hod) problems.push("Pick your HOD.");
    if (intimationSent && !intimationDate) problems.push("Pick the date you sent the intimation email.");
    if (reports.length === 0) problems.push("Attach at least one medical report or prescription.");
    if (problems.length) {
      Alert.alert("Almost there", problems.join("\n"));
      return;
    }
    const flags = [
      late ? `It will be marked LATE (${lateBy} days after rejoining; the limit is ${LATE_LIMIT_DAYS}).` : null,
      intimations.length === 0 ? "No copy of the intimation email is attached." : null,
    ].filter(Boolean);
    const go = async () => {
      setSubmitting(true);
      try {
        const r = await submitMedical({
          leaveId,
          cgpa: cgpa.trim(),
          reason: reason.trim(),
          fromDate,
          toDate,
          rejoinedOn,
          intimationSent,
          intimationDate: intimationSent ? intimationDate : null,
          hodEmail: hod!.email,
          attachments: files,
        });
        onDone(`${existing ? "Resubmitted" : "Submitted"} as ${r.refNo}. The Academic Office will check it first. You'll get a notification and an email at every step.`);
      } catch (e: any) {
        Alert.alert("Couldn't submit", e?.message ?? "Please try again.");
      } finally {
        setSubmitting(false);
      }
    };
    Alert.alert(
      existing ? "Resubmit this application?" : "Submit this application?",
      [`It goes to the Academic Office (${cfg?.office?.email ?? "office"}).`, ...flags].join("\n\n"),
      [
        { text: "Cancel", style: "cancel" },
        { text: existing ? "Resubmit" : "Submit", onPress: go },
      ],
    );
  };

  if (cfg === undefined) return <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} />;
  if (!medicalReady(cfg)) {
    return (
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={s.warn}>Medical leave isn't set up yet. Please contact the admin.</Text>
      </Card>
    );
  }

  const fileRow = (f: MedicalAttachment) => (
    <View key={f.id} style={s.file}>
      <Ionicons name={f.contentType === "application/pdf" ? "document-text" : "image"} size={18} color={colors.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.fileName} numberOfLines={1}>
          {f.name}
        </Text>
        <Text style={s.fileMeta}>
          {KIND_LABEL[f.kind]} · {sizeLabel(f.size)}
        </Text>
      </View>
      <TouchableOpacity onPress={() => remove(f)} accessibilityLabel={`Remove ${f.name}`} style={s.fileX}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const addBtn = (kind: AttachmentKind, label: string, hint: string) => (
    <TouchableOpacity style={s.add} onPress={() => pick(kind)} disabled={!!uploading}>
      {uploading === kind ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add-circle-outline" size={22} color={colors.primary} />}
      <View style={{ flex: 1 }}>
        <Text style={s.addTitle}>{label}</Text>
        <Text style={s.addHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View>
      {existing?.returnNote ? (
        <View style={s.returned}>
          <Ionicons name="return-down-back" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={s.returnedTitle}>Returned by the {existing.returnedBy ?? "office"}</Text>
            <Text style={s.returnedText}>{existing.returnNote}</Text>
          </View>
        </View>
      ) : null}

      <View style={s.formHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>IIIT SURAT · EXAMS/ACADEMICS</Text>
          <Text style={s.formTitle}>Request for considering absenteeism due to medical reasons</Text>
        </View>
        <Pressable onPress={() => openSafeUrl(MEDICAL_TEMPLATE_URL).catch(() => undefined)} style={s.tpl} accessibilityRole="link">
          <Ionicons name="download-outline" size={16} color={colors.primary} />
          <Text style={s.tplText}>Blank form</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => setShowRules((v) => !v)} style={s.rules}>
        <View style={s.rulesHead}>
          <Ionicons name="information-circle" size={18} color={colors.primary} />
          <Text style={s.rulesTitle}>Instructions</Text>
          <Ionicons name={showRules ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
        </View>
        {showRules ? (
          <View style={{ gap: 6, marginTop: 8 }}>
            <Text style={s.rule}>
              1. Within 24 hours of the leave starting, email the Course Coordinator, Office, HoD, Coordinator/Dean Academics and Chief Warden (if in a hostel).
            </Text>
            <Text style={s.rule}>2. After rejoining, submit this within {LATE_LIMIT_DAYS} days. Later requests are flagged and may not be considered.</Text>
            <Text style={s.rule}>3. Attach your medical reports and a screenshot or PDF of the intimation email.</Text>
            <Text style={s.rule}>4. The Academic Office checks it, the Medical Officer verifies it, then the HOD, Associate Dean and Joint Registrar sign.</Text>
          </View>
        ) : null}
      </Pressable>

      <Section title="Student details" hint="From your profile. Ask the admin if something is wrong.">
        <View style={s.grid}>
          <Info label="Name" value={profile.name} />
          <Info label="Reg. No." value={profile.enrollmentNumber ?? "—"} />
          <Info label="Branch & Year" value={[profile.branch, year ? `${ORD[year] ?? `${year}th`} Year` : null].filter(Boolean).join(", ") || "—"} />
          <Info label="Semester" value={sem ? String(sem) : "—"} />
        </View>
        <FieldLabel>CGPA (optional)</FieldLabel>
        <TextInput
          style={[ui.input, { maxWidth: 160 }]}
          value={cgpa}
          onChangeText={(t) => setCgpa(t.replace(/[^0-9.]/g, "").slice(0, 5))}
          placeholder="e.g. 8.42"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
        />
      </Section>

      <Section title="Period of absenteeism">
        <View style={s.dates}>
          <View style={s.dateCol}>
            <FieldLabel>First day absent</FieldLabel>
            <DateField
              value={fromDate}
              max={today}
              onChange={(d) => {
                setFromDate(d);
                if (!toDate || toDate < d) setToDate(d);
                if (rejoinedOn && rejoinedOn <= d) setRejoinedOn("");
              }}
              placeholder="Pick"
            />
          </View>
          <View style={s.dateCol}>
            <FieldLabel>Last day absent</FieldLabel>
            <DateField
              value={toDate}
              min={fromDate || undefined}
              max={addDays(today, -1)}
              onChange={(d) => {
                setToDate(d);
                if (rejoinedOn && rejoinedOn <= d) setRejoinedOn("");
              }}
              placeholder="Pick"
            />
          </View>
          <View style={s.dateCol}>
            <FieldLabel>Rejoined on</FieldLabel>
            <DateField value={rejoinedOn} min={toDate ? addDays(toDate, 1) : undefined} max={today} onChange={setRejoinedOn} placeholder="Pick" />
          </View>
        </View>
        {days > 0 ? <Text style={s.note}>{days} day{days === 1 ? "" : "s"} of absence</Text> : null}
        {rejoinedOn ? (
          late ? (
            <View style={[s.flag, s.flagBad]}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[s.flagText, { color: colors.danger }]}>
                You rejoined {lateBy} days ago. The limit is {LATE_LIMIT_DAYS} days, so this will be marked LATE and may not be considered.
              </Text>
            </View>
          ) : (
            <View style={[s.flag, s.flagOk]}>
              <Ionicons name="time-outline" size={16} color={colors.successFg} />
              <Text style={[s.flagText, { color: colors.successFg }]}>
                {LATE_LIMIT_DAYS - lateBy <= 0 ? "Today is the last day to submit." : `Submit within ${LATE_LIMIT_DAYS - lateBy} more day${LATE_LIMIT_DAYS - lateBy === 1 ? "" : "s"} (by ${prettyIso(addDays(rejoinedOn, LATE_LIMIT_DAYS))}).`}
              </Text>
            </View>
          )
        ) : null}
      </Section>

      <Section title="Medical reason">
        <TextInput
          style={[ui.input, s.area]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Viral fever with throat infection; the doctor advised four days of bed rest."
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={600}
        />
        <Text style={s.counter}>{reason.trim().length}/600</Text>
      </Section>

      <Section title="Your HOD">
        <SelectField value={hod ? `${hod.name} · ${hod.department}` : null} placeholder="Choose your department's HOD" icon="school-outline" onPress={() => setHodOpen(true)} />
      </Section>

      <Section title="Email intimation">
        <View style={s.switchRow}>
          <Text style={s.switchText}>I emailed the Course Coordinator, Office, HoD, Dean Academics and Chief Warden about this leave</Text>
          <Switch value={intimationSent} onValueChange={setIntimationSent} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        {intimationSent ? (
          <View style={{ marginTop: spacing.sm, maxWidth: 260 }}>
            <FieldLabel>Date sent</FieldLabel>
            <DateField value={intimationDate} min={fromDate ? addDays(fromDate, -3) : undefined} max={today} onChange={setIntimationDate} placeholder="Pick" />
          </View>
        ) : null}
        {intimationLate ? <Text style={s.soft}>Sent more than 24 hours after the leave began. The office will see this.</Text> : null}
      </Section>

      <Section title="Enclosures" hint="PDF or photos, up to 10 MB each, 8 files in total.">
        {reports.map(fileRow)}
        {addBtn("report", reports.length ? "Add another report" : "Attach medical reports", "Prescriptions, test results, doctor's certificate")}
        <View style={{ height: spacing.sm }} />
        {intimations.map(fileRow)}
        {addBtn("intimation", intimations.length ? "Add another" : "Attach the intimation email", "Screenshot or PDF of the email you sent")}
        <Text style={s.soft}>The Medical Officer attaches the verified certificate after checking your reports.</Text>
      </Section>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {onCancel ? <PrimaryButton tone="secondary" label="Cancel" onPress={onCancel} style={{ flex: 1 }} /> : null}
        <PrimaryButton label={existing ? "Resubmit to office" : "Submit to Academic Office"} icon="send" onPress={submit} loading={submitting} style={{ flex: 2 }} />
      </View>

      <SheetPicker
        visible={hodOpen}
        title="Your HOD"
        items={hods}
        keyOf={(h) => h.email}
        labelOf={(h) => h.name}
        sublabelOf={(h) => h.department}
        selectedKey={hodEmail || null}
        onPick={(h) => setHodEmail(h.email)}
        onClose={() => setHodOpen(false)}
      />
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.info}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  warn: { fontSize: 14, color: colors.danger, fontWeight: "600" },
  returned: { flexDirection: "row", gap: 10, backgroundColor: colors.warningBg, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  returnedTitle: { fontSize: 14, fontWeight: "800", color: colors.warning },
  returnedText: { fontSize: 14, color: colors.warningText, marginTop: 2 },
  formHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  kicker: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.6 },
  formTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  tpl: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tplText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  rules: { backgroundColor: colors.badge.blue.bg, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  rulesHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  rulesTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  rule: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  info: { flexGrow: 1, flexBasis: 140, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dateCol: { flexGrow: 1, flexBasis: 150 },
  note: { fontSize: 13, fontWeight: "700", color: colors.primary, marginTop: spacing.sm },
  flag: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: radius.md, padding: 10, marginTop: spacing.sm },
  flagBad: { backgroundColor: colors.dangerBg },
  flagOk: { backgroundColor: colors.successBg },
  flagText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  area: { minHeight: 96, textAlignVertical: "top" },
  counter: { fontSize: 11, color: colors.textSecondary, alignSelf: "flex-end", marginTop: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  soft: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.successBorder, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  fileName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  fileMeta: { fontSize: 11, color: colors.textSecondary },
  fileX: { padding: 6 },
  add: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, borderRadius: radius.md, padding: 12, backgroundColor: colors.surface },
  addTitle: { fontSize: 14, fontWeight: "700", color: colors.primary },
  addHint: { fontSize: 12, color: colors.textSecondary },
});
