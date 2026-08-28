import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToAnnouncements, deleteAnnouncement, Announcement } from "../firebase/announcementsService";

function timeAgo(ts: Announcement["createdAt"]): string {
  if (!ts) return "";
  const diff = Date.now() - ts.toMillis();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AnnouncementsScreen() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const isFaculty = profile?.role === "faculty";

  useEffect(() => {
    const viewer = isFaculty
      ? null
      : { branch: profile?.branch, section: profile?.section, admissionYear: profile?.admissionYear };
    const unsubscribe = subscribeToAnnouncements((items) => {
      setAnnouncements(items);
      setLoading(false);
    }, viewer);
    return () => unsubscribe();
  }, [isFaculty, profile?.branch, profile?.section, profile?.admissionYear]);

  const handleDelete = (item: Announcement) => {
    Alert.alert("Delete announcement?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAnnouncement(item.id);
          } catch (err: any) {
            Alert.alert("Couldn't delete", err.message ?? "Please try again.");
          }
        },
      },
    ]);
  };

  const targetLabel = (a: Announcement) =>
    [a.targetBranch, a.targetSection, a.targetAdmissionYear].filter(Boolean).join(" · ");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.headerTitle}>Announcements</Text>
        <Text style={styles.subtitle}>Quick class updates from faculty</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : announcements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No announcements right now.</Text>
          </View>
        ) : (
          <FlatList
            data={announcements}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.targetPill}>
                    <Text style={styles.targetPillText}>{targetLabel(item)}</Text>
                  </View>
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.author}>{item.createdByName}</Text>
                  {profile?.uid === item.createdBy && (
                    <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
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
  subtitle: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSecondary },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  targetPill: { backgroundColor: colors.primary + "20", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  targetPillText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  time: { fontSize: 11, color: colors.textSecondary },
  message: { ...typography.body, color: colors.textPrimary },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  author: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic" },
});
