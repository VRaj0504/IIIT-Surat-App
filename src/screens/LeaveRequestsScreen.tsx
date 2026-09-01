import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  subscribeToLeaveRequestsForFaculty,
  resolveLeaveApplication,
  LeaveApplication,
} from "../firebase/leaveService";

const statusColors: Record<LeaveApplication["status"], string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

export default function LeaveRequestsScreen() {
  const { profile } = useAuth();
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile?.email) return;
    const unsubscribe = subscribeToLeaveRequestsForFaculty(profile.email, (apps) => {
      setApplications(apps);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.email]);

  const handleResolve = async (app: LeaveApplication, status: "approved" | "rejected") => {
    if (!profile?.uid) return;
    try {
      await resolveLeaveApplication(app.id, profile.uid, status, remarkDrafts[app.id]);
    } catch (err: any) {
      Alert.alert("Couldn't update", err.message ?? "Please try again.");
    }
  };

  const pending = applications.filter((a) => a.status === "pending");
  const resolved = applications.filter((a) => a.status !== "pending");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.headerTitle}>Leave Requests</Text>

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : applications.length === 0 ? (
          <Text style={styles.emptyText}>No leave requests addressed to you.</Text>
        ) : (
          <FlatList
            data={[...pending, ...resolved]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.studentName}>{item.studentName}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColors[item.status] + "20" }]}>
                    <Text style={[styles.statusPillText, { color: statusColors[item.status] }]}>{item.status}</Text>
                  </View>
                </View>
                {item.studentEnrollmentNumber && (
                  <Text style={styles.meta}>{item.studentEnrollmentNumber}</Text>
                )}
                <Text style={styles.meta}>
                  {item.type === "medical" ? "Medical" : "Casual"} · {item.fromDate} to {item.toDate}
                </Text>
                <Text style={styles.reason}>{item.reason}</Text>
                {item.documentUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(item.documentUrl!)}>
                    <Text style={styles.documentLink}>View attached document</Text>
                  </TouchableOpacity>
                )}

                {item.status === "pending" ? (
                  <>
                    <TextInput
                      style={styles.remarkInput}
                      value={remarkDrafts[item.id] ?? ""}
                      onChangeText={(text) => setRemarkDrafts((prev) => ({ ...prev, [item.id]: text }))}
                      placeholder="Optional remark"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => handleResolve(item, "approved")}
                      >
                        <Text style={styles.approveButtonText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleResolve(item, "rejected")}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  item.facultyRemark && <Text style={styles.remarkText}>Remark: {item.facultyRemark}</Text>
                )}
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reason: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  documentLink: { fontSize: 12, color: colors.primary, marginTop: 6, fontWeight: "600" },
  remarkInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.textPrimary,
  },
  remarkText: { fontSize: 12, color: colors.textPrimary, marginTop: spacing.sm, fontStyle: "italic" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center" },
  approveButton: { backgroundColor: colors.success + "20" },
  approveButtonText: { color: colors.success, fontWeight: "700" },
  rejectButton: { backgroundColor: colors.danger + "20" },
  rejectButtonText: { color: colors.danger, fontWeight: "700" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
