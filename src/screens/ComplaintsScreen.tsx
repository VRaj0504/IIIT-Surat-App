import React, { useState, useEffect, useCallback, memo, useMemo } from "react";
import ComplaintPhotos from "../components/ComplaintPhotos";
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToAllComplaints, resolveComplaint, Complaint } from "../firebase/complaintService";
import { KeyboardAwareFlatList } from "../components/KeyboardAware";
import { Segmented, StatusPill, EmptyState } from "../components/ui";
import SkeletonList from "../components/Skeleton";

type TypeFilter = "all" | "complaint" | "doubt";
type Tab = "todo" | "done";

function ago(c: Complaint): string {
  const s = (c.createdAt as any)?.seconds;
  if (!s) return "";
  const mins = Math.floor((Date.now() / 1000 - s) / 60);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : new Date(s * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const ComplaintRow = memo(function ComplaintRow({
  item,
  onResolve,
}: {
  item: Complaint;
  onResolve: (item: Complaint, status: "resolved" | "rejected", remark: string) => Promise<void>;
}) {
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<null | "resolved" | "rejected">(null);
  const doubt = item.type === "doubt";
  const tone = doubt ? colors.badge.blue : colors.badge.peach;
  const act = async (status: "resolved" | "rejected") => {
    setBusy(status);
    await onResolve(item, status, remark);
    setBusy(null);
  };
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
          <Text style={[styles.avatarText, { color: tone.fg }]}>{initials(item.studentName || "?")}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.studentName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[item.studentEnrollmentNumber, ago(item)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <StatusPill status={item.status} label={item.status === "resolved" && doubt ? "Answered" : item.status === "rejected" && doubt ? "Dismissed" : undefined} />
      </View>

      <View style={styles.tagRow}>
        <View style={[styles.tag, { backgroundColor: tone.bg }]}>
          <Text style={[styles.tagText, { color: tone.fg }]}>{doubt ? "Doubt" : "Complaint"}</Text>
        </View>
        <View style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.tagText, { color: colors.textSecondary }]}>{item.category}</Text>
        </View>
        <Text style={styles.to} numberOfLines={1}>
          {item.facultyName ? `To ${item.facultyName}` : "To committee"}
        </Text>
      </View>

      <Text style={styles.subject}>{item.subject}</Text>
      <Text style={styles.body}>{item.description}</Text>
      <ComplaintPhotos paths={item.photoPaths} />

      {item.status === "pending" ? (
        <>
          <TextInput
            style={styles.remarkInput}
            value={remark}
            onChangeText={setRemark}
            placeholder={doubt ? "Write your answer (optional)" : "Add a remark (optional)"}
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={() => act("rejected")} disabled={!!busy} accessibilityRole="button">
              {busy === "rejected" ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="close" size={18} color={colors.danger} />}
              <Text style={styles.btnRejectText}>{doubt ? "Dismiss" : "Reject"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={() => act("resolved")} disabled={!!busy} accessibilityRole="button">
              {busy === "resolved" ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons name="checkmark" size={18} color={colors.onPrimary} />}
              <Text style={styles.btnApproveText}>{doubt ? "Answered" : "Resolved"}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : item.facultyRemark ? (
        <View style={styles.remarkBox}>
          <Text style={styles.remarkLabel}>{item.resolvedByName ? `${item.resolvedByName} replied` : "Reply"}</Text>
          <Text style={styles.remarkText}>{item.facultyRemark}</Text>
        </View>
      ) : null}
    </View>
  );
});

export default function ComplaintsScreen() {
  const { profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tab, setTab] = useState<Tab>("todo");

  useEffect(() => {
    if (!profile?.email) return;
    const unsubscribe = subscribeToAllComplaints(
      { email: profile.email, isAdmin: profile.isAdmin === true || (profile.role as string) === "admin" },
      setComplaints,
    );
    return () => unsubscribe();
  }, [profile?.email, profile?.isAdmin, profile?.role]);

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

  const all = complaints ?? [];
  const inTab = useMemo(() => all.filter((c) => (tab === "todo" ? c.status === "pending" : c.status !== "pending")), [all, tab]);
  const shown = typeFilter === "all" ? inTab : inTab.filter((c) => c.type === typeFilter);
  const pendingCount = all.filter((c) => c.status === "pending").length;
  const count = (t: TypeFilter) => (t === "all" ? inTab.length : inTab.filter((c) => c.type === t).length);

  const header = (
    <View>
      <Segmented
        options={[
          { value: "todo", label: "To do", badge: pendingCount || undefined },
          { value: "done", label: "Handled" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        {(["all", "complaint", "doubt"] as TypeFilter[]).map((f) => {
          const on = typeFilter === f;
          return (
            <TouchableOpacity key={f} style={[styles.chip, on && styles.chipOn]} onPress={() => setTypeFilter(f)} accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {f === "all" ? "All" : f === "complaint" ? "Complaints" : "Doubts"} {count(f)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAwareFlatList
          data={complaints === null ? [] : shown}
          keyExtractor={(item: Complaint) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={header}
          ListEmptyComponent={
            complaints === null ? (
              <SkeletonList count={3} lines={2} />
            ) : (
              <EmptyState
                icon={tab === "todo" ? "checkmark-done-outline" : "archive-outline"}
                title={tab === "todo" ? "You're all caught up" : "Nothing handled yet"}
                hint={tab === "todo" ? "New complaints and doubts sent to you appear here, and you get a notification." : "Complaints you resolve or reject move here."}
              />
            )
          }
          renderItem={({ item }: { item: Complaint }) => <ComplaintRow item={item} onResolve={handleResolve} />}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  chipsWrap: { flexGrow: 0, marginTop: spacing.sm, marginBottom: spacing.xs, marginHorizontal: -spacing.md },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  chipTextOn: { color: colors.onPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  tag: { height: 24, paddingHorizontal: 9, borderRadius: 8, justifyContent: "center" },
  tagText: { fontSize: 11.5, fontWeight: "800" },
  to: { flex: 1, fontSize: 12, color: colors.textSecondary, textAlign: "right" },
  subject: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  body: { ...typography.body, color: colors.textPrimary, marginTop: 4, lineHeight: 21 },
  remarkInput: { minHeight: 44, marginTop: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, fontSize: 14, color: colors.textPrimary },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  btn: { flex: 1, height: 46, borderRadius: radius.full, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  btnReject: { backgroundColor: colors.dangerBg },
  btnRejectText: { color: colors.danger, fontWeight: "800", fontSize: 14.5 },
  btnApprove: { backgroundColor: colors.success },
  btnApproveText: { color: colors.onPrimary, fontWeight: "800", fontSize: 14.5 },
  remarkBox: { marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  remarkLabel: { fontSize: 11.5, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  remarkText: { fontSize: 14, color: colors.textPrimary, marginTop: 2 },
});
