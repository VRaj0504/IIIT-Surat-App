import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToCurriculum } from "../firebase/curriculumService";
import { getCurrentSemesterNumber } from "../firebase/announcementsService";
import { getMyAttendance, SubjectAttendance } from "../firebase/attendanceService";
import LoadingSpinner from "../components/LoadingSpinner";

const MINIMUM_PERCENTAGE = 75;

export default function MyAttendanceScreen() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectAttendance[]>([]);

  useEffect(() => {
    if (!profile?.enrollmentNumber || !profile.branch || !profile.section || !profile.admissionYear) {
      setLoading(false);
      return;
    }

    // Previously fetched curriculum for all 8 semesters unconditionally
    // — this is exactly what caused the multi-second load delay, since
    // each semester with subjects triggered its own set of attendance
    // queries even for semesters the student was never in. Now only the
    // student's actual current semester (and the one just before it, in
    // case they're still checking a just-finished semester's numbers
    // right at the start of a new one) get queried at all.
    const currentSemester = getCurrentSemesterNumber(profile.admissionYear);
    const semestersToCheck = Array.from(new Set([currentSemester - 1, currentSemester].filter((s) => s >= 1 && s <= 8)));
    const unsubscribes = semestersToCheck.map((sem) =>
      subscribeToCurriculum(profile.branch!, sem, (curriculumSubjects) => {
        if (curriculumSubjects.length === 0) return;
        getMyAttendance({
          enrollmentNumber: profile.enrollmentNumber!,
          branch: profile.branch!,
          admissionYear: profile.admissionYear!,
          section: profile.section!,
          subjects: curriculumSubjects.map((s) => ({ code: s.code, name: s.name })),
        })
          .then((results) => {
            setSubjects((prev) => {
              const withoutThisSemester = prev.filter(
                (p) => !curriculumSubjects.some((s) => s.code === p.subjectCode),
              );
              return [...withoutThisSemester, ...results];
            });
          })
          .finally(() => setLoading(false));
      }),
    );

    return () => unsubscribes.forEach((u) => u());
  }, [profile?.enrollmentNumber, profile?.branch, profile?.section, profile?.admissionYear]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>My Attendance</Text>

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : subjects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No attendance recorded yet.</Text>
          </View>
        ) : (
          <FlatList
            data={subjects}
            keyExtractor={(item) => item.subjectCode}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isBelow = item.percentage < MINIMUM_PERCENTAGE;
              return (
                <View style={[styles.card, isBelow && styles.cardWarning]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.subjectName}>{item.subjectName}</Text>
                    {isBelow && (
                      <View style={styles.warningPill}>
                        <Ionicons name="warning" size={12} color={colors.surface} />
                        <Text style={styles.warningPillText}>Below {MINIMUM_PERCENTAGE}%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.percentage, isBelow && styles.percentageWarning]}>
                    {item.percentage}%
                  </Text>
                  <Text style={styles.detail}>
                    Present {item.presentCount} of {item.totalSessions} sessions
                  </Text>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl * 2 },
  emptyText: { ...typography.body, color: colors.textSecondary },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...clayShadowSoft,
  },
  cardWarning: { borderWidth: 1, borderColor: colors.danger + "40" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subjectName: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  warningPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  warningPillText: { color: colors.surface, fontSize: 10, fontWeight: "700" },
  percentage: { fontSize: 32, fontWeight: "800", color: colors.success, marginTop: spacing.sm },
  percentageWarning: { color: colors.danger },
  detail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
