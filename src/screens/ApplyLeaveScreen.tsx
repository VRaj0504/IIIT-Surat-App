import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import {
  applyForLeave,
  subscribeToMyLeaveApplications,
  LeaveApplication,
  LeaveType,
  approvalChain,
  approverName,
  APPROVER_LABEL,
} from "../firebase/leaveService";
import { MedicalRequest, isFlow2 } from "../firebase/medicalService";
import MedicalApplyForm from "../components/medical/MedicalApplyForm";
import { MedicalTrackCard } from "../components/medical/MedicalCards";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";
import DateField from "../components/DateField";
import LoadingSpinner from "../components/LoadingSpinner";
import { openSafeUrl } from "../utils/safeLink";
import { useWebLayout } from "../utils/useWebLayout";
import {
  Card,
  EmptyState,
  FieldLabel,
  PrimaryButton,
  Section,
  Segmented,
  SelectField,
  SheetPicker,
  StatusPill,
  Timeline,
  TimelineStep,
  dateRange,
  ui,
} from "../components/ui";

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function parseStrictDate(value: string): Date | null {
  if (!DATE_FORMAT.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function medicalSteps(app: LeaveApplication): TimelineStep[] {
  const chain = approvalChain(app);
  const stage = app.stage ?? "doctor";
  const done = stage === "teachers" || stage === "done";
  const steps: TimelineStep[] = chain.map((role) => {
    const d = app[`${role}Decision` as const];
    const name = approverName(role, app);
    if (d?.decision === "approved") {
      return { title: `${APPROVER_LABEL[role]} approved`, detail: d.byName || name, note: d.remark, state: "done" };
    }
    if (d?.decision === "rejected") {
      return { title: `${APPROVER_LABEL[role]} rejected`, detail: d.byName || name, note: d.remark, state: "rejected" };
    }
    if (stage === role) {
      return {
        title: `Waiting for ${APPROVER_LABEL[role]}`,
        detail: role === "doctor" ? `${name} checks your report` : name,
        state: "current",
      };
    }
    return { title: APPROVER_LABEL[role], detail: name, state: stage === "rejected" ? "todo" : "todo" };
  });
  steps.push({
    title: done ? "Approved" : "Classes counted as present",
    detail: done
      ? app.teacherNote ?? "Your classes in these dates count as present. A teacher can still choose not to excuse one of theirs."
      : "After the last approval",
    state: done ? "done" : "todo",
  });
  return steps;
}

export default function ApplyLeaveScreen() {
  const { profile } = useAuth();
  const { isDesktop } = useWebLayout();
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [facultyPickerOpen, setFacultyPickerOpen] = useState(false);
  const [type, setType] = useState<LeaveType>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<MedicalRequest | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [myApplications, setMyApplications] = useState<LeaveApplication[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);


  useEffect(() => subscribeToFacultyDirectory(setFaculty), []);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeToMyLeaveApplications(profile.uid, (apps) => {
      setMyApplications(apps);
      setHistoryLoading(false);
    });
  }, [profile?.uid]);

  const pendingCount = myApplications.filter((a) => a.status === "pending").length;


  const reset = () => {
    setSelectedFaculty(null);
    setFromDate("");
    setToDate("");
    setReason("");
  };

  const medicalDone = (msg: string) => {
    setEditing(null);
    setFormKey((k) => k + 1);
    setTab("mine");
    Alert.alert("Application sent", msg);
  };

  const editMedical = (r: MedicalRequest) => {
    setEditing(r);
    setType("medical");
    setTab("new");
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (!selectedFaculty) {
      Alert.alert("Pick a teacher", "Choose who this request goes to.");
      return;
    }
    const from = parseStrictDate(fromDate.trim());
    const to = parseStrictDate(toDate.trim());
    if (!from || !to) {
      Alert.alert("Pick the dates", "Choose the first and last day of your leave.");
      return;
    }
    if (to < from) {
      Alert.alert("Check the dates", "The last day can't be before the first day.");
      return;
    }
    const reasonTrimmed = reason.trim();
    if (reasonTrimmed.length < 10 || reasonTrimmed.split(/\s+/).filter(Boolean).length < 3) {
      Alert.alert("Add a reason", "Briefly explain why you need this leave, in a few words.");
      return;
    }
    setSubmitting(true);
    try {
      const t = selectedFaculty;
      await applyForLeave({
        studentUid: profile.uid,
        studentName: profile.name,
        studentEnrollmentNumber: profile.enrollmentNumber,
        facultyEmail: t.email,
        facultyUid: t.uid,
        facultyName: t.name,
        type,
        fromDate,
        toDate,
        reason: reasonTrimmed,
      });
      reset();
      setTab("mine");
      Alert.alert("Request sent", `It went to ${t.name}. You can track it under My requests.`);
    } catch (err: any) {
      Alert.alert("Couldn't submit", err.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const newForm = (
    <>
            <Section title="Type of leave">
              <View style={styles.typeRow}>
                {(
                  [
                    { v: "casual", icon: "calendar-outline", title: "Casual", sub: "Goes to one teacher" },
                    { v: "medical", icon: "medkit-outline", title: "Medical", sub: "Official college form" },
                  ] as const
                ).map((o) => {
                  const active = type === o.v;
                  return (
                    <TouchableOpacity
                      key={o.v}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                      onPress={() => {
                        setType(o.v);
                        setSelectedFaculty(null);
                        if (o.v === "casual") setEditing(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={o.icon} size={22} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.typeTitle, active && { color: colors.primary }]}>{o.title}</Text>
                      <Text style={styles.typeSub}>{o.sub}</Text>
                      {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={styles.typeCheck} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>

            {type === "medical" ? (
              profile ? (
                <MedicalApplyForm
                  key={`${editing?.id ?? "new"}-${formKey}`}
                  profile={profile}
                  existing={editing}
                  onDone={medicalDone}
                  onCancel={editing ? () => setEditing(null) : undefined}
                />
              ) : null
            ) : (
              <>
            <Section title="Dates">
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <FieldLabel>First day</FieldLabel>
                  <DateField
                    value={fromDate}
                    onChange={(d) => {
                      setFromDate(d);
                      if (!toDate || toDate < d) setToDate(d);
                    }}
                    placeholder="Select date"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel>Last day</FieldLabel>
                  <DateField value={toDate} onChange={setToDate} min={fromDate || undefined} placeholder="Select date" />
                </View>
              </View>
              {fromDate && toDate ? <Text style={styles.daysNote}>{dateRange(fromDate, toDate)}</Text> : null}
            </Section>

              <Section title="Send to">
                <SelectField
                  value={selectedFaculty?.name}
                  placeholder="Choose a teacher"
                  icon="person-outline"
                  onPress={() => setFacultyPickerOpen(true)}
                />
              </Section>

            <Section title="Reason">
              <TextInput
                style={[ui.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Family function at home"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={500}
              />
              <Text style={styles.counter}>{reason.trim().length}/500</Text>
            </Section>

            <PrimaryButton
              label="Send request"
              icon="send"
              onPress={handleSubmit}
              loading={submitting}
              style={!(selectedFaculty && fromDate.trim() && toDate.trim() && reason.trim().length >= 10) && { opacity: 0.5 }}
            />
              </>
            )}
    </>
  );

  const mineList = historyLoading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : myApplications.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No requests yet" hint="Leaves you apply for show up here with their progress." />
        ) : (
          myApplications.map((app) => {
            if (isFlow2(app as any)) return <MedicalTrackCard key={app.id} r={app as unknown as MedicalRequest} onEdit={editMedical} />;
            const medical = app.type === "medical" && !!app.stage;
            return (
              <Card key={app.id} style={styles.reqCard}>
                <View style={styles.reqHead}>
                  <View style={[styles.reqIcon, medical && { backgroundColor: colors.badge.pink.bg }]}>
                    <Ionicons
                      name={medical ? "medkit-outline" : "calendar-outline"}
                      size={18}
                      color={medical ? colors.badge.pink.fg : colors.badge.blue.fg}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqTitle}>{medical ? "Medical leave" : "Casual leave"}</Text>
                    <Text style={styles.reqSub}>{dateRange(app.fromDate, app.toDate)}</Text>
                  </View>
                  <StatusPill status={app.status} />
                </View>
                <Text style={styles.reqReason}>{app.reason}</Text>
                {medical ? (
                  <>
                    <Timeline steps={medicalSteps(app)} />
                    {app.medicalReportUrl ? (
                      <TouchableOpacity onPress={() => openSafeUrl(app.medicalReportUrl!).catch(() => undefined)} style={styles.reportLink}>
                        <Ionicons name="document-outline" size={16} color={colors.primary} />
                        <Text style={styles.reportLinkText}>View your report</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.reqTo}>
                    To {app.facultyName}
                    {app.facultyRemark ? `\nRemark: “${app.facultyRemark}”` : ""}
                  </Text>
                )}
              </Card>
            );
          })
        );

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentDesk]} keyboardShouldPersistTaps="handled">
        {isDesktop ? (
          <View style={styles.desk}>
            <View style={styles.deskForm}>
              <Text style={styles.deskTitle}>New request</Text>
              {newForm}
            </View>
            <View style={styles.deskList}>
              <Text style={styles.deskTitle}>
                Your requests{pendingCount ? ` · ${pendingCount} in progress` : ""}
              </Text>
              {mineList}
            </View>
          </View>
        ) : (
          <>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "new", label: "New request" },
            { value: "mine", label: "My requests", badge: pendingCount || undefined },
          ]}
        />

            {tab === "new" ? newForm : mineList}
          </>
        )}
      </KeyboardAwareScrollView>

      <SheetPicker
        visible={facultyPickerOpen}
        title="Send to"
        items={faculty}
        keyOf={(f) => f.uid ?? f.email}
        labelOf={(f) => f.name}
        sublabelOf={(f) => f.department}
        selectedKey={selectedFaculty ? selectedFaculty.uid ?? selectedFaculty.email : null}
        onPick={setSelectedFaculty}
        onClose={() => setFacultyPickerOpen(false)}
        searchable
        emptyText="No teacher matches that name."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  contentDesk: { paddingHorizontal: 16, paddingTop: 16, width: "100%", maxWidth: 1180, alignSelf: "center" },
  desk: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  deskForm: { flex: 1.1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, padding: 24 },
  deskList: { flex: 1, minWidth: 0 },
  deskTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, color: colors.textPrimary, marginBottom: spacing.md },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  typeCardActive: { borderColor: colors.primary, backgroundColor: colors.badge.blue.bg },
  typeTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginTop: 4 },
  typeSub: { fontSize: 12, color: colors.textSecondary },
  typeCheck: { position: "absolute", top: 10, right: 10 },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  daysNote: { fontSize: 13, fontWeight: "700", color: colors.primary, marginTop: spacing.sm },
  warn: { fontSize: 14, color: colors.danger, fontWeight: "600" },
  upload: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    minHeight: 72,
  },
  uploadDone: { borderStyle: "solid", borderColor: colors.successBorder, backgroundColor: colors.successBg },
  uploadTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  uploadSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  textArea: { minHeight: 96, textAlignVertical: "top" },
  counter: { fontSize: 11, color: colors.textSecondary, alignSelf: "flex-end", marginTop: 4 },
  reqCard: { marginBottom: spacing.md },
  reqHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reqIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.badge.blue.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  reqTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  reqSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  reqReason: { fontSize: 13, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 19 },
  reqTo: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 19 },
  reportLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  reportLinkText: { fontSize: 13, fontWeight: "700", color: colors.primary },
});
