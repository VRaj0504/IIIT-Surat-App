import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  CounsellingRequest,
  isCounsellor,
  subscribeToCounsellingQueue,
  updateCounsellingRequest,
} from "../firebase/counsellingService";
import LoadingSpinner from "../components/LoadingSpinner";

function RequestCard({
  item,
  onUpdate,
  contactedByUid,
  contactedByName,
}: {
  item: CounsellingRequest;
  onUpdate: (status: "contacted" | "closed", note: string) => void;
  contactedByUid: string;
  contactedByName: string;
}) {
  const [note, setNote] = useState(item.privateNote ?? "");
  const [busy, setBusy] = useState(false);

  const act = async (status: "contacted" | "closed") => {
    setBusy(true);
    try {
      await updateCounsellingRequest(item.id, { status, privateNote: note, contactedBy: contactedByUid, contactedByName });
      onUpdate(status, note);
    } catch (err: any) {
      Alert.alert("Couldn't update", err.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, item.urgent && item.status === "pending" && styles.cardUrgent]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.studentName}>
          {item.studentName}
          {item.studentEnrollmentNumber ? ` (${item.studentEnrollmentNumber})` : ""}
        </Text>
        {item.urgent && <Text style={styles.urgentBadge}>URGENT</Text>}
      </View>
      <Text style={styles.meta}>
        {item.concern} · {item.studentEmail} · {item.status}
      </Text>
      <Text style={styles.message}>{item.message}</Text>

      {item.status !== "closed" && (
        <>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Private note (only visible to the counselling team)"
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <View style={styles.actionRow}>
            {item.status === "pending" && (
              <TouchableOpacity style={styles.actionButton} onPress={() => act("contacted")} disabled={busy}>
                <Text style={styles.actionButtonText}>Mark contacted</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionButton, styles.closeButton]} onPress={() => act("closed")} disabled={busy}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

export default function CounsellingQueueScreen() {
  const { profile } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<CounsellingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.email) return;
    isCounsellor(profile.email).then(setAuthorized);
  }, [profile?.email]);

  useEffect(() => {
    if (!authorized) return;
    const unsubscribe = subscribeToCounsellingQueue((data) => {
      setRequests(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [authorized]);

  if (authorized === null) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!authorized) {
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <Text style={styles.header}>Counselling Requests</Text>
          <Text style={styles.emptyText}>
            You're not on the counselling team's list, so there's nothing to show here. If that's wrong, ask an
            admin to add your email to the `counsellors` collection.
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.header}>Counselling Requests</Text>
        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>Nothing here right now.</Text>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <RequestCard
                item={item}
                contactedByUid={profile?.uid ?? ""}
                contactedByName={profile?.name ?? "Counsellor"}
                onUpdate={() => {}}
              />
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  emptyText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.lg },
  listContent: { paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUrgent: { borderColor: colors.danger, borderWidth: 2 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  urgentBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  message: { ...typography.body, color: colors.textPrimary, marginTop: spacing.sm },
  noteInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 50,
    textAlignVertical: "top",
    color: colors.textPrimary,
    fontSize: 13,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionButtonText: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  closeButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  closeButtonText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
});
