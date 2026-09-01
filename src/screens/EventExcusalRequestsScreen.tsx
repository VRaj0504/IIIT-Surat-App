import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToAssignedExcusals, respondToExcusal, EventExcusal } from "../firebase/eventExcusalService";
import LoadingSpinner from "../components/LoadingSpinner";

export default function EventExcusalRequestsScreen() {
  const { profile } = useAuth();
  const [excusals, setExcusals] = useState<EventExcusal[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToAssignedExcusals(profile.uid, (data) => {
      setExcusals(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const handleRespond = async (excusal: EventExcusal, status: "approved" | "rejected") => {
    setRespondingId(excusal.id);
    try {
      await respondToExcusal(excusal.id, status, remarkDrafts[excusal.id]?.trim() || null);
    } catch (err: any) {
      Alert.alert("Couldn't respond", err.message ?? "Please try again.");
    } finally {
      setRespondingId(null);
    }
  };

  const pending = excusals.filter((e) => e.status === "pending");
  const resolved = excusals.filter((e) => e.status !== "pending");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>Event Excusal Requests</Text>
        <Text style={styles.helper}>
          Approving covers every listed student's attendance across all their subjects for the
          given dates — individual subject faculty don't need to separately approve anything.
        </Text>

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : excusals.length === 0 ? (
          <Text style={styles.emptyNote}>No requests assigned to you.</Text>
        ) : (
          <FlatList
            data={[...pending, ...resolved]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.eventName}>{item.eventName}</Text>
                <Text style={styles.detail}>{item.fromDate} to {item.toDate}</Text>
                <Text style={styles.detail}>Submitted by {item.submittedByName}</Text>
                <Text style={styles.detail}>{item.studentEnrollmentNumbers.length} students: {item.studentEnrollmentNumbers.join(", ")}</Text>

                {item.status === "pending" ? (
                  <>
                    <TextInput
                      style={styles.remarkInput}
                      placeholder="Optional remark"
                      placeholderTextColor={colors.textSecondary}
                      value={remarkDrafts[item.id] ?? ""}
                      onChangeText={(text) => setRemarkDrafts((prev) => ({ ...prev, [item.id]: text }))}
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => handleRespond(item, "rejected")}
                        disabled={respondingId === item.id}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => handleRespond(item, "approved")}
                        disabled={respondingId === item.id}
                      >
                        {respondingId === item.id ? (
                          <ActivityIndicator color={colors.surface} />
                        ) : (
                          <Text style={styles.approveButtonText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={[styles.statusPill, { backgroundColor: item.status === "approved" ? colors.success : colors.danger }]}>
                    <Text style={styles.statusPillText}>{item.status === "approved" ? "Approved" : "Rejected"}</Text>
                  </View>
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
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  helper: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.md },
  emptyNote: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...clayShadowSoft,
  },
  eventName: { ...typography.h3, color: colors.textPrimary },
  detail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  remarkInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  rejectButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  rejectButtonText: { color: colors.danger, fontWeight: "700" },
  approveButton: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  approveButtonText: { color: colors.surface, fontWeight: "700" },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, marginTop: spacing.sm },
  statusPillText: { color: colors.surface, fontSize: 11, fontWeight: "700" },
});
