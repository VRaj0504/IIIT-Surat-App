import React, { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import {
  subscribeToInbox,
  markInboxRead,
  markAllInboxRead,
  deleteInboxItem,
  clearInbox,
  InboxItem,
} from "../firebase/inboxService";
import { pushTarget } from "../utils/pushRoute";
import LoadingSpinner from "../components/LoadingSpinner";

function iconFor(item: InboxItem): keyof typeof Ionicons.glyphMap {
  const t = `${item.title} ${item.channel}`.toLowerCase();
  if (t.includes("sos")) return "alert-circle";
  if (t.includes("notice")) return "megaphone-outline";
  if (t.includes("exam")) return "calendar-outline";
  if (t.includes("grade") || t.includes("result")) return "ribbon-outline";
  if (t.includes("class") || t.includes("timetable")) return "time-outline";
  if (t.includes("leave")) return "document-text-outline";
  if (t.includes("resource")) return "folder-open-outline";
  if (t.includes("lost") || t.includes("found")) return "search-outline";
  if (t.includes("complaint") || t.includes("doubt")) return "chatbubble-ellipses-outline";
  return "notifications-outline";
}

function ago(item: InboxItem): string {
  const ms = item.createdAt?.toMillis?.();
  if (!ms) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const { profile, previewRole } = useAuth();
  const isFaculty = (previewRole ?? profile?.role) === "faculty";
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = profile?.uid;
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeToInbox(uid, setItems, () => setItems([]));
  }, [uid]);

  const open = useCallback(
    (item: InboxItem) => {
      if (!uid) return;
      if (!item.read) markInboxRead(uid, item.id).catch(() => {});
      const target = pushTarget(item.title, item.data, isFaculty);
      if (target) (nav as any).navigate(target.name, target.params);
    },
    [uid, nav, isFaculty],
  );

  const unread = (items ?? []).filter((i) => !i.read).length;
  const hasItems = !!items && items.length > 0;

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: hasItems
        ? () => (
            <View style={styles.actions}>
              {unread > 0 && (
                <Pressable onPress={() => uid && items && markAllInboxRead(uid, items).catch(() => {})} hitSlop={8}>
                  <Text style={styles.action}>Read all</Text>
                </Pressable>
              )}
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert("Clear all notifications?", "This removes them from this list only.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", style: "destructive", onPress: () => uid && items && clearInbox(uid, items).catch(() => {}) },
                  ])
                }
              >
                <Text style={[styles.action, { color: colors.danger }]}>Clear</Text>
              </Pressable>
            </View>
          )
        : undefined,
    });
  }, [nav, hasItems, unread, uid, items]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {items === null ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={14}
            windowSize={9}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyText}>New notifications are kept here for 60 days, even after you swipe them away.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => open(item)}
                onLongPress={() => uid && deleteInboxItem(uid, item.id).catch(() => {})}
                style={({ pressed }) => [styles.card, !item.read && styles.cardUnread, pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.iconWrap, !item.read && { backgroundColor: colors.primary }]}>
                  <Ionicons name={iconFor(item)} size={18} color={item.read ? colors.textSecondary : colors.surface} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.time}>{ago(item)}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={4}>{item.body}</Text>
                </View>
              </Pressable>
            )}
          />
        )}
        {items && items.length > 0 && <Text style={styles.hint}>Press and hold a notification to delete it.</Text>}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.lg },
  action: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.primary + "55" },
  iconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  titleUnread: { fontWeight: "800" },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  body: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  hint: { textAlign: "center", fontSize: 11, color: colors.textSecondary, paddingVertical: spacing.sm },
});
