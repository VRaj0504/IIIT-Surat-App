import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToNotices, deleteNotice, Notice } from "../firebase/noticesService";
import { openSafeUrl } from "../utils/safeLink";
import LoadingSpinner from "../components/LoadingSpinner";
import TapCard from "../components/TapCard";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type Category = Notice["category"];
type Filter = "All" | Category;

// Same pastel tones as Home — one colour per kind of notice, everywhere.
const TONE: Record<Category, keyof typeof colors.tile> = {
  Academic: "blue",
  Placement: "mint",
  Event: "peach",
  Club: "lilac",
  General: "yellow",
};
const ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  Academic: "school-outline",
  Placement: "briefcase-outline",
  Event: "calendar-outline",
  Club: "people-outline",
  General: "megaphone-outline",
};
const FILTERS: Filter[] = ["All", "Academic", "Placement", "Event", "Club", "General"];

function ago(ms: number, now: number): string {
  const m = Math.round((now - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function NoticeCard({
  item,
  now,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: Notice;
  now: number;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = colors.tile[TONE[item.category] ?? "blue"];
  const created = item.createdAt ? item.createdAt.toMillis() : 0;
  const isNew = created > 0 && now - created < 24 * 60 * 60 * 1000;
  const target = [item.targetBranch, item.targetSection, item.targetSpecialization, item.targetAdmissionYear]
    .filter(Boolean)
    .join(" · ");
  const long = (item.description ?? "").length > 160;

  return (
    <TapCard style={styles.card} onPress={() => long && setOpen((o) => !o)} pressScale={long ? 0.99 : 1}>
      <View style={styles.cardTop}>
        <View style={[styles.catIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={ICON[item.category] ?? "megaphone-outline"} size={18} color={tone.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.catText, { color: tone.fg }]} numberOfLines={1}>
            {item.clubId && item.clubName ? item.clubName : item.category}
            {target ? <Text style={styles.targetText}>{`  ·  For ${target}`}</Text> : null}
          </Text>
          <Text style={styles.when}>
            {created ? ago(created, now) : ""}
            {item.createdByName ? ` · ${item.createdByName}` : ""}
          </Text>
        </View>
        {isNew && (
          <View style={styles.newPill}>
            <Text style={styles.newText}>NEW</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{item.title}</Text>
      {!!item.description && (
        <Text style={styles.body} numberOfLines={open ? undefined : 4}>
          {item.description}
        </Text>
      )}
      {long && <Text style={styles.more}>{open ? "Show less" : "Read more"}</Text>}

      {(item.link || canEdit || canDelete) && (
        <View style={styles.actions}>
          {item.link ? (
            <TouchableOpacity style={styles.attach} onPress={() => openSafeUrl(item.link!).catch(() => {})}>
              <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
              <Text style={styles.attachText}>Open attachment</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {canEdit && (
            <TouchableOpacity style={styles.iconBtn} onPress={onEdit} accessibilityLabel="Edit notice">
              <Ionicons name="pencil-outline" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={styles.iconBtn} onPress={onDelete} accessibilityLabel="Delete notice">
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TapCard>
  );
}

export default function NoticesScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, profile } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const now = Date.now();

  useEffect(() => {
    // Faculty/admin see every notice regardless of targeting (they need to
    // moderate/manage all of them); students only see untargeted notices
    // plus ones targeted at their own branch/section/year.
    const viewer =
      profile?.role === "student"
        ? {
            branch: profile.branch,
            section: profile.section,
            admissionYear: profile.admissionYear,
            specialization: profile.specialization,
          }
        : undefined;
    const unsubscribe = subscribeToNotices((updated) => {
      setNotices(updated);
      setLoading(false);
    }, viewer);
    return unsubscribe;
  }, [profile?.role, profile?.branch, profile?.section, profile?.admissionYear, profile?.specialization]);

  const handleDelete = (notice: Notice) => {
    Alert.alert("Delete notice?", `"${notice.title}" will be removed for everyone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNotice(notice.id).catch(() => {}) },
    ]);
  };

  // Only offer the categories that actually have notices (plus All).
  const filters = useMemo(() => FILTERS.filter((f) => f === "All" || notices.some((n) => n.category === f)), [notices]);
  const shown = filter === "All" ? notices : notices.filter((n) => n.category === filter);
  const newCount = notices.filter((n) => n.createdAt && now - n.createdAt.toMillis() < 24 * 60 * 60 * 1000).length;
  const isFaculty = profile?.role === "faculty";

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{newCount > 0 ? `${newCount} new today` : "Campus updates"}</Text>
            <Text style={styles.h1}>Notices</Text>
          </View>
          {isFaculty && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate("PostNotice", undefined)}
              accessibilityLabel="Post a notice"
            >
              <Ionicons name="add" size={18} color={colors.onPrimary} />
              <Text style={styles.addText}>Post</Text>
            </TouchableOpacity>
          )}
        </View>

        {filters.length > 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
            {filters.map((f) => {
              const active = f === filter;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="notifications-off-outline" size={26} color={colors.textSecondary} />
                </View>
                <Text style={styles.emptyTitle}>No notices{filter !== "All" ? ` in ${filter}` : ""} yet</Text>
                <Text style={styles.emptySub}>New ones show up here and on your phone.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <NoticeCard
                item={item}
                now={now}
                canEdit={user?.uid === item.createdBy}
                canDelete={user?.uid === item.createdBy || isFaculty}
                onEdit={() => navigation.navigate("PostNotice", { editingNotice: item })}
                onDelete={() => handleDelete(item)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 18 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingTop: spacing.md, marginBottom: 12, gap: 12 },
  kicker: { fontSize: 13, fontWeight: "700", color: colors.primary },
  h1: { ...typography.h1, color: colors.textPrimary, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 4,
  },
  addText: { color: colors.onPrimary, fontWeight: "800", fontSize: 13 },

  chipsWrap: { flexGrow: 0, flexShrink: 0, height: 40, marginBottom: 12, marginHorizontal: -18 },
  chips: { gap: 8, paddingHorizontal: 18, alignItems: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  chipTextActive: { color: colors.onInk },

  list: { paddingBottom: spacing.xl * 2, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  catIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catText: { fontSize: 13, fontWeight: "800" },
  targetText: { color: colors.textSecondary, fontWeight: "700" },
  when: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 1 },
  newPill: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  newText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  title: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
  more: { fontSize: 13, fontWeight: "800", color: colors.primary, marginTop: 6 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attach: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  attachText: { fontSize: 13, fontWeight: "800", color: colors.primary },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { alignItems: "center", paddingTop: 60, gap: 6 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  emptySub: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
});
