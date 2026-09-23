import React, { useState, useEffect, useCallback, memo } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { subscribeToAllComplaints, resolveComplaint, Complaint } from "../firebase/complaintService";

const statusColors: Record<Complaint["status"], string> = {
  pending: colors.warning,
  resolved: colors.success,
  rejected: colors.danger,
};

// Memoized, and the remark draft lives HERE (local state) rather than in
// a shared map on the parent — previously every keystroke into any one
// row's remark box updated a Record<string,string> on ComplaintsScreen
// itself, which re-rendered (and recreated renderItem for) every row in
// the list on every keystroke, not just the one being typed into. Same
// pattern as ResourcesScreen.tsx's ResourceRow.
const ComplaintRow = memo(function ComplaintRow({
  item,
  onResolve,
}: {
  item: Complaint;
  onResolve: (item: Complaint, status: "resolved" | "rejected", remark: string) => void;
}) {
  const [remark, setRemark] = useState("");
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <View style={[styles.typePill, item.type === "doubt" && styles.typePillDoubt]}>
            <Text style={[styles.typePillText, item.type === "doubt" && styles.typePillTextDoubt]}>
              {item.type === "complaint" ? "Complaint" : "Doubt"}
            </Text>
          </View>
          <Text style={styles.studentName}>{item.subject}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColors[item.status] + "20" }]}>
          <Text style={[styles.statusPillText, { color: statusColors[item.status] }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.meta}>
        {item.category} · {item.studentName}
        {item.studentEnrollmentNumber ? ` (${item.studentEnrollmentNumber})` : ""}
      </Text>
      <Text style={styles.addressee}>{item.facultyName ? `To: ${item.facultyName}` : "To: Any faculty / admin"}</Text>
      <Text style={styles.reason}>{item.description}</Text>

      {item.status === "pending" ? (
        <>
          <TextInput
            style={styles.remarkInput}
            value={remark}
            onChangeText={setRemark}
            placeholder="Optional remark"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => onResolve(item, "resolved", remark)}
            >
              <Text style={styles.approveButtonText}>
                {item.type === "doubt" ? "Mark Answered" : "Mark Resolved"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => onResolve(item, "rejected", remark)}
            >
              <Text style={styles.rejectButtonText}>{item.type === "doubt" ? "Dismiss" : "Reject"}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        item.facultyRemark && <Text style={styles.remarkText}>Remark: {item.facultyRemark}</Text>
      )}
    </View>
  );
});

type TypeFilter = "all" | "complaint" | "doubt";

export default function ComplaintsScreen() {
  const { profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  useEffect(() => {
    const unsubscribe = subscribeToAllComplaints((data) => {
      setComplaints(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleResolve = useCallback(
    async (complaint: Complaint, status: "resolved" | "rejected", remark: string) => {
      if (!profile?.uid) return;
      try {
        await resolveComplaint(complaint.id, profile.uid, profile.name, status, remark);
      } catch (err: any) {
        Alert.alert("Couldn't update", err.message ?? "Please try again.");
      }
    },
    [profile?.uid, profile?.name],
  );

  const filtered = typeFilter === "all" ? complaints : complaints.filter((c) => c.type === typeFilter);
  const pending = filtered.filter((c) => c.status === "pending");
  const resolved = filtered.filter((c) => c.status !== "pending");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.headerTitle}>Complaints & Doubts</Text>

        <View style={styles.filterRow}>
          {(["all", "complaint", "doubt"] as TypeFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
              onPress={() => setTypeFilter(f)}
            >
              <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
                {f === "all" ? "All" : f === "complaint" ? "Complaints" : "Doubts"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {typeFilter === "all" ? "Nothing submitted yet." : `No ${typeFilter}s submitted yet.`}
          </Text>
        ) : (
          <FlatList
            data={[...pending, ...resolved]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <ComplaintRow item={item} onResolve={handleResolve} />}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  filterChipTextActive: { color: colors.surface },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.badge.peach.bg },
  typePillDoubt: { backgroundColor: colors.badge.blue.bg },
  typePillText: { fontSize: 10, fontWeight: "700", color: colors.badge.peach.fg },
  typePillTextDoubt: { color: colors.badge.blue.fg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  addressee: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontStyle: "italic" },
  reason: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
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
