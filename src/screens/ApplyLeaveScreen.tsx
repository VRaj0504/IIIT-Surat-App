import React, { useState, useEffect, useMemo } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/storage";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToFacultyDirectory, FacultyMember } from "../firebase/facultyService";
import {
  applyForLeave,
  applyForMedicalLeave,
  getMedicalLeaveConfig,
  subscribeToMyLeaveApplications,
  LeaveApplication,
  LeaveType,
  MedicalLeaveConfig,
  MedicalStage,
  approvalChain,
  approverName,
  APPROVER_LABEL,
  ApproverRole,
} from "../firebase/leaveService";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";
import DateField from "../components/DateField";

const statusColors: Record<LeaveApplication["status"], string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function parseStrictDate(value: string): Date | null {
  if (!DATE_FORMAT.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
 return date;
}

function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

const SHORT_LABEL: Record<ApproverRole, string> = { doctor: "Doctor", dr: "DR", dean: "Dean", hod: "HOD" };

function MedicalProgress({ app }: { app: LeaveApplication }) {
  const stage = app.stage ?? "doctor";
  const chain = approvalChain(app);
  const steps: { stage: MedicalStage; label: string }[] = [
    ...chain.map((r) => ({ stage: r as MedicalStage, label: SHORT_LABEL[r] })),
    { stage: "done", label: "Approved" },
  ];
  const approved = stage === "teachers" || stage === "done";
  const rejectedRole: ApproverRole | null =
    stage !== "rejected" ? null : [...chain].reverse().find((r) => app[`${r}Decision` as const]?.decision === "rejected") ?? "doctor";
  const currentIndex = approved
    ? steps.length - 1
    : steps.findIndex((s) => s.stage === (rejectedRole ?? stage));
  const rejectedAt: MedicalStage | null = rejectedRole;

  let caption: string;
  if (approved) {
    caption = app.teacherNote ?? "Fully approved. Your classes in these dates count as present. A teacher can still choose not to excuse one of their classes.";
  } else if (rejectedRole) {
    const d = app[`${rejectedRole}Decision` as const];
    caption = `Rejected by ${d?.byName ?? approverName(rejectedRole, app)}${d?.remark ? `: "${d.remark}"` : "."}`;
  } else {
    const role = stage as ApproverRole;
    const idx = chain.indexOf(role);
    const prev = idx > 0 ? `${APPROVER_LABEL[chain[idx - 1]]} approved · ` : "";
    caption = `${prev}Waiting for ${approverName(role, app)}${role === "doctor" ? " to check your report" : ""}.`;
  }
  const MEDICAL_STEPS = steps;

  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={progressStyles.row}>
        {MEDICAL_STEPS.map((s, i) => {
          const isRejectedHere = rejectedAt === s.stage;
          const done = approved || i < currentIndex;
          const active = !isRejectedHere && i === currentIndex && !approved;
          const color = isRejectedHere ? colors.danger : done ? colors.success : active ? colors.primary : colors.border;
          return (
            <React.Fragment key={s.stage}>
              {i > 0 && <View style={[progressStyles.line, { backgroundColor: done || active ? color : colors.border }]} />}
              <View style={progressStyles.step}>
                <View style={[progressStyles.dot, { backgroundColor: color }]}>
                  {(done || isRejectedHere) && (
                    <Ionicons name={isRejectedHere ? "close" : "checkmark"} size={11} color={colors.surface} />
                  )}
                </View>
                <Text style={[progressStyles.label, (active || isRejectedHere) && { color, fontWeight: "700" }]}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
      <Text style={progressStyles.caption}>{caption}</Text>
      {(stage === "teachers" || stage === "done") && (app.unmatchedFaculty?.length ?? 0) > 0 && (
        <Text style={progressStyles.note}>
          Some classes list no matched teacher ({app.unmatchedFaculty!.join(", ")}) — show your approved leave to them
          directly.
        </Text>
      )}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  step: { alignItems: "center", width: 56 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  line: { flex: 1, height: 2, marginTop: 8 },
  label: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  caption: { fontSize: 12, color: colors.textPrimary, marginTop: spacing.sm },
  note: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontStyle: "italic" },
});

export default function ApplyLeaveScreen() {
  const { profile } = useAuth();
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [type, setType] = useState<LeaveType>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [medicalReportUrl, setMedicalReportUrl] = useState("");
  const [medicalReportFileName, setMedicalReportFileName] = useState("");
  const [uploadingReport, setUploadingReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [medicalConfig, setMedicalConfig] = useState<MedicalLeaveConfig | null | undefined>(undefined);
  useEffect(() => {
    getMedicalLeaveConfig()
      .then(setMedicalConfig)
      .catch(() => setMedicalConfig(null));
  }, []);
  const medicalHod = profile?.branch ? medicalConfig?.hodByBranch?.[profile.branch] : undefined;

  const handleTypeChange = (next: LeaveType) => {
    setType(next);
    setSelectedFaculty(null);
    if (next !== "medical") {
      setMedicalReportUrl("");
      setMedicalReportFileName("");
    }
  };

  const handlePickMedicalReport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    if (!profile) return;
    setUploadingReport(true);
    try {

      const safeName = asset.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `medicalReports/${profile.uid}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, path);
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await uploadBytes(fileRef, blob, { contentType: asset.mimeType ?? "application/octet-stream" });
      const url = await getDownloadURL(fileRef);
      setMedicalReportUrl(url);
      setMedicalReportFileName(asset.name);
    } catch (err: any) {
      Alert.alert("Couldn't upload", err.message ?? "Please try again.");
    } finally {
      setUploadingReport(false);
    }
  };

  const [myApplications, setMyApplications] = useState<LeaveApplication[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToFacultyDirectory((data) => setFaculty(data));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToMyLeaveApplications(profile.uid, (apps) => {
      setMyApplications(apps);
      setHistoryLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return faculty;
    return faculty.filter((f) => f.name?.toLowerCase().includes(q));
  }, [faculty, facultySearch]);

  const handleSubmit = async () => {
    if (!profile) return;
    if (type === "casual" && !selectedFaculty) {
      Alert.alert("Pick a faculty member", "Choose who this request is addressed to.");
      return;
    }
    if (!fromDate.trim() || !toDate.trim() || !reason.trim()) {
      Alert.alert("Missing details", "Fill in the dates and a reason.");
      return;
    }

    const from = parseStrictDate(fromDate.trim());
   const to = parseStrictDate(toDate.trim());
    if (!from || !to) {
      Alert.alert("Invalid dates", 'Enter both dates as YYYY-MM-DD, e.g. "2026-09-15".');
      return;
    }
    if (to < from) {
      Alert.alert("Invalid date range", 'The "To" date can\'t be before the "From" date.');
      return;
    }
    const reasonTrimmed = reason.trim();
    const wordCount = reasonTrimmed.split(/\s+/).filter(Boolean).length;
    if (reasonTrimmed.length < 10 || wordCount < 3) {
      Alert.alert(
        "Add a real reason",
        "Briefly explain why you need this leave, in a few actual words — not a placeholder.",
      );
      return;
    }

    const reportUrlTrimmed = medicalReportUrl.trim();

    if (type === "medical" && !reportUrlTrimmed) {
      Alert.alert("Add your medical report", "Attach a PDF or photo of your report before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      let sentTo: string;
      if (type === "medical") {
        if (!profile.branch) throw new Error("Your profile has no branch set, so your HOD can't be found. Contact the admin.");
        const route = await applyForMedicalLeave({
          studentUid: profile.uid,
          studentName: profile.name,
          studentEnrollmentNumber: profile.enrollmentNumber,
          studentBranch: profile.branch,
          fromDate: fromDate.trim(),
          toDate: toDate.trim(),
          reason: reasonTrimmed,
          medicalReportUrl: reportUrlTrimmed,
        });
        const after = [
          route.drName ? `${route.drName} (Deputy Registrar)` : "",
          route.deanName ? `${route.deanName} (Dean)` : "",
          `${route.hodName} (HOD)`,
        ].filter(Boolean);
        sentTo = `${route.doctorName}. After the doctor, it goes to ${after.join(", then ")}. Once approved, your classes in those dates count as present.`;
      } else {
        const to = selectedFaculty!;
        await applyForLeave({
          studentUid: profile.uid,
          studentName: profile.name,
          studentEnrollmentNumber: profile.enrollmentNumber,
          facultyEmail: to.email,
          facultyUid: to.uid,
          facultyName: to.name,
          type,
          fromDate: fromDate.trim(),
          toDate: toDate.trim(),
          reason: reasonTrimmed,
        });
        sentTo = `${to.name}.`;
      }
      setSelectedFaculty(null);
      setFromDate("");
      setToDate("");
      setReason("");
      setMedicalReportUrl("");
      setMedicalReportFileName("");
      Alert.alert("Submitted", `Your leave request was sent to ${sentTo}`);
    } catch (err: any) {
      Alert.alert("Couldn't submit", err.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView behavior={undefined} style={{ flex: 1 }}>
        <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.header}>Apply for Leave</Text>

          <Text style={styles.label}>Type</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, type === "casual" && styles.toggleButtonActive]}
              onPress={() => handleTypeChange("casual")}
            >
              <Text style={[styles.toggleText, type === "casual" && styles.toggleTextActive]}>Casual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, type === "medical" && styles.toggleButtonActive]}
              onPress={() => handleTypeChange("medical")}
            >
              <Text style={[styles.toggleText, type === "medical" && styles.toggleTextActive]}>Medical</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Addressed to</Text>
          {type === "medical" ? (
            <View style={styles.routeCard}>
              {medicalConfig === undefined ? (
                <ActivityIndicator color={colors.primary} />
              ) : !medicalConfig?.doctor || !medicalHod ? (
                <Text style={styles.routeWarning}>
                  Medical leave isn't set up for your branch yet — contact the admin.
                </Text>
              ) : (
                <>
                  {[
                    `${medicalConfig.doctor.name} (Doctor)`,
                    ...(medicalConfig.dr?.email ? [`${medicalConfig.dr.name || "Deputy Registrar"} (Deputy Registrar)`] : []),
                    ...(medicalConfig.dean?.email ? [`${medicalConfig.dean.name || "Dean"} (Dean, Academics)`] : []),
                    `${medicalHod.name} (HOD, ${profile?.branch ?? ""})`,
                    "Approved: your classes in these dates count as present",
                  ].map((line, i) => (
                    <Text key={i} style={styles.routeStep}>
                      {i + 1} · {line}
                    </Text>
                  ))}
                </>
              )}
            </View>
          ) : (
          <TouchableOpacity
            style={styles.dropdownField}
            onPress={() => setPickerOpen(true)}
          >
            <Text
              style={selectedFaculty ? styles.dropdownValue : styles.dropdownPlaceholder}
            >
              {selectedFaculty ? selectedFaculty.name : "Select a faculty member"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          )}

          <Modal
            visible={pickerOpen}
            animationType="slide"
            transparent
            onRequestClose={() => setPickerOpen(false)}
          >
            <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select faculty</Text>
                  <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={facultySearch}
                  onChangeText={setFacultySearch}
                  placeholder="Search faculty by name"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <FlatList
                  data={filteredFaculty}
                  keyExtractor={(f) => f.uid ?? f.email}
                  style={styles.modalList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={styles.emptyNote}>No faculty match that name.</Text>
                  }
                  renderItem={({ item: f }) => (
                    <TouchableOpacity
                      style={styles.facultyOption}
                      onPress={() => {
                        setSelectedFaculty(f);
                        setFacultySearch("");
                        setPickerOpen(false);
                      }}
                    >
                      <Text style={styles.facultyOptionText}>{f.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Text style={styles.label}>From</Text>
          <DateField
            value={fromDate}
            onChange={(d) => {
              setFromDate(d);
              if (toDate && toDate < d) setToDate(d);
            }}
            placeholder="First day of leave"
          />

          <Text style={styles.label}>To</Text>
          <DateField value={toDate} onChange={setToDate} min={fromDate || undefined} placeholder="Last day of leave" />

          {type === "medical" && (
            <>
              <Text style={styles.label}>Medical Report (PDF or photo)</Text>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={handlePickMedicalReport}
                disabled={uploadingReport}
              >
                {uploadingReport ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name={medicalReportUrl ? "checkmark-circle" : "attach-outline"}
                      size={18}
                      color={medicalReportUrl ? colors.success : colors.primary}
                    />
                    <Text style={[styles.attachButtonText, medicalReportUrl && { color: colors.success }]}>
                      {medicalReportFileName || "Attach report"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>
                Attach the actual PDF or photo of your report from your phone — the Medical Officer needs to open it
                before approving.
              </Text>
            </>
          )}

          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={reason}
            onChangeText={setReason}
            placeholder="Briefly explain why you need this leave"
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitButtonText}>Submit Request</Text>}
          </TouchableOpacity>

          <Text style={styles.historyHeader}>Your Requests</Text>
          {historyLoading ? (
            <LoadingSpinner style={{ marginTop: spacing.md }} />
          ) : myApplications.length === 0 ? (
            <Text style={styles.emptyText}>No leave requests yet.</Text>
          ) : (
            myApplications.map((app) => (
              <View key={app.id} style={styles.historyCard}>
                <View style={styles.historyHeaderRow}>
                  <Text style={styles.historyTitle}>
                    {app.type === "medical" ? "Medical" : "Casual"} · {app.fromDate} to {app.toDate}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColors[app.status] + "20" }]}>
                    <Text style={[styles.statusPillText, { color: statusColors[app.status] }]}>{app.status}</Text>
                  </View>
                </View>
                {app.type === "medical" && app.stage ? (
                  <>
                    <Text style={styles.historyReason}>{app.reason}</Text>
                    <MedicalProgress app={app} />
                  </>
                ) : (
                  <>
                    <Text style={styles.historySubtitle}>To {app.facultyName}</Text>
                    <Text style={styles.historyReason}>{app.reason}</Text>
                    {app.facultyRemark && (
                      <Text style={styles.historyRemark}>Remark: {app.facultyRemark}</Text>
                    )}
                  </>
                )}
              </View>
            ))
          )}
        </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontStyle: "italic" },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  routeStep: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  routeWarning: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  attachButtonText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.full, padding: 4 },
  toggleButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, alignItems: "center" },
  toggleButtonActive: { backgroundColor: colors.primary },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  toggleTextActive: { color: colors.surface },
  dropdownField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dropdownValue: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  dropdownPlaceholder: { ...typography.body, color: colors.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  modalList: { marginTop: spacing.sm },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.md, textAlign: "center" },
  facultyOption: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  facultyOptionText: { ...typography.body, color: colors.textPrimary },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
  historyHeader: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary },
  historyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...clayShadowSoft },
  historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  historySubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyReason: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  historyRemark: { fontSize: 12, color: colors.textPrimary, marginTop: 4, fontStyle: "italic" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
