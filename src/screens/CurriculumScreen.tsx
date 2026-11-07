import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import LoadingSpinner from "../components/LoadingSpinner";
import { EmptyState } from "../components/ui";

const BRANCHES = ["CSE", "ECE", "MNC"];

export default function CurriculumScreen() {
  const { profile } = useAuth();
  const maxSem = profile?.program === "PG" ? 4 : 8;
  const current = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : 1;
  const [branch, setBranch] = useState<string>(profile?.branch ?? "CSE");
  const [semester, setSemester] = useState(current);
  const [picker, setPicker] = useState<"semester" | "branch" | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);

  useEffect(() => {
    setSubjects(null);
    return subscribeToCurriculum(branch, semester, (list) =>
      setSubjects([...list].sort((a, b) => a.code.localeCompare(b.code))),
    );
  }, [branch, semester]);

  const totalCredits = useMemo(() => (subjects ?? []).reduce((n, s) => n + (s.credits ?? 0), 0), [subjects]);
  const options = picker === "semester" ? Array.from({ length: maxSem }, (_, i) => String(i + 1)) : BRANCHES;

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.subtitle}>Subjects and credits for each semester</Text>

        <View style={styles.pickers}>
          <TouchableOpacity style={styles.field} onPress={() => setPicker("branch")}>
            <Text style={styles.fieldLabel}>Branch</Text>
            <View style={styles.fieldValueRow}>
              <Text style={styles.fieldValue}>{branch}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.field} onPress={() => setPicker("semester")}>
            <Text style={styles.fieldLabel}>Semester</Text>
            <View style={styles.fieldValueRow}>
              <Text style={styles.fieldValue}>
                {semester}
                {semester === current && branch === profile?.branch ? " (current)" : ""}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {subjects === null ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title={`No subjects for ${branch} · Semester ${semester} yet`}
            hint={
              profile?.role === "faculty"
                ? "Subjects are added from the faculty portal → Curriculum. Try another semester or branch above."
                : "The academic office hasn't added this semester yet. Try another semester or branch above."
            }
          />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {subjects.length} subjects{totalCredits ? ` · ${totalCredits} credits` : ""}
              </Text>
            </View>
            {subjects.map((s) => (
              <View key={s.code} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subject}>{s.name}</Text>
                  <Text style={styles.code}>{s.code}</Text>
                </View>
                {s.credits != null && (
                  <View style={styles.credits}>
                    <Text style={styles.creditsNum}>{s.credits}</Text>
                    <Text style={styles.creditsLabel}>credits</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{picker === "semester" ? "Semester" : "Branch"}</Text>
              <ScrollView style={{ maxHeight: 420 }}>
                {options.map((o) => {
                  const selected = picker === "semester" ? String(semester) === o : branch === o;
                  return (
                    <TouchableOpacity
                      key={o}
                      style={styles.option}
                      onPress={() => {
                        if (picker === "semester") setSemester(Number(o));
                        else setBranch(o);
                        setPicker(null);
                      }}
                    >
                      <Text style={[styles.optionText, selected && styles.optionSelected]}>
                        {picker === "semester" ? `Semester ${o}` : o}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  header: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  pickers: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  field: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  fieldValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  fieldValue: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  summary: { marginBottom: spacing.sm },
  summaryText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  subject: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  code: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  credits: {
    minWidth: 52,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.badge.green.bg,
  },
  creditsNum: { fontSize: 18, fontWeight: "800", color: colors.badge.green.fg },
  creditsLabel: { fontSize: 10, fontWeight: "700", color: colors.badge.green.fg },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { ...typography.body, color: colors.textPrimary },
  optionSelected: { color: colors.primary, fontWeight: "800" },
});
