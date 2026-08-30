import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToMyGrades, computeTranscript, GradeEntry } from "../firebase/gradesService";

export default function TranscriptScreen() {
  const { profile } = useAuth();
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.enrollmentNumber) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToMyGrades(profile.enrollmentNumber, (items) => {
      setGrades(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.enrollmentNumber]);

  const transcript = computeTranscript(grades);
  const gradesBySemester = new Map<number, GradeEntry[]>();
  grades.forEach((g) => {
    const list = gradesBySemester.get(g.subjectSemester) ?? [];
    list.push(g);
    gradesBySemester.set(g.subjectSemester, list);
  });

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>Official Transcript</Text>
          <Text style={styles.subtitle}>Entered by your subject faculty — this is your official record.</Text>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : grades.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="school-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No grades entered yet.</Text>
            </View>
          ) : (
            <>
              <View style={styles.cgpaCard}>
                <Text style={styles.cgpaLabel}>Overall CGPA</Text>
                <Text style={styles.cgpaValue}>{transcript.cgpa?.toFixed(2) ?? "—"}</Text>
                <Text style={styles.cgpaCredits}>{transcript.totalCredits} credits completed</Text>
              </View>

              {transcript.semesters.map((sem) => (
                <View key={sem.semester} style={styles.semesterCard}>
                  <View style={styles.semesterHeader}>
                    <Text style={styles.semesterTitle}>Semester {sem.semester}</Text>
                    <Text style={styles.semesterSgpa}>SGPA {sem.sgpa.toFixed(2)}</Text>
                  </View>
                  {(gradesBySemester.get(sem.semester) ?? []).map((g) => (
                    <View key={g.id} style={styles.subjectRow}>
                      <Text style={styles.subjectName}>{g.subjectName}</Text>
                      <Text style={styles.subjectMeta}>
                        {g.credits} cr · {g.grade}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  cgpaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.lg,
    ...clayShadowSoft,
  },
  cgpaLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  cgpaValue: { fontSize: 40, fontWeight: "800", color: colors.primary, marginTop: 4 },
  cgpaCredits: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  semesterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...clayShadowSoft,
  },
  semesterHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  semesterTitle: { ...typography.h3, color: colors.textPrimary },
  semesterSgpa: { ...typography.body, color: colors.primary, fontWeight: "700" },
  subjectRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  subjectName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  subjectMeta: { fontSize: 12, color: colors.textSecondary },
});
