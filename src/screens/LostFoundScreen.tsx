import React, { useState, useEffect, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  subscribeToLostFoundItems,
  resolveLostFoundItem,
  deleteLostFoundItem,
  notifyLostFoundContact,
  LostFoundItem,
  LostFoundType,
} from "../firebase/lostFoundService";
import type { RootStackParamList } from "../navigation/types";
import LoadingSpinner from "../components/LoadingSpinner";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const categoryColors: Record<string, string> = {
  Electronics: colors.primary,
  "Documents/ID Cards": colors.danger,
  Accessories: colors.warning,
  "Books/Notes": colors.success,
  Clothing: "#8B5CF6",
  Other: colors.textSecondary,
};

const ItemCard = memo(function ItemCard({
  item,
  isOwner,
  onContact,
  onResolve,
  onDelete,
}: {
  item: LostFoundItem;
  isOwner: boolean;
  onContact: (item: LostFoundItem, method: "email" | "call" | "whatsapp") => void;
  onResolve: (item: LostFoundItem) => void;
  onDelete: (item: LostFoundItem) => void;
}) {
  const tint = categoryColors[item.category] ?? colors.textSecondary;
  return (
    <View style={[styles.card, item.status === "resolved" && styles.cardResolved]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {item.status === "resolved" && (
            <View style={styles.resolvedPill}>
              <Text style={styles.resolvedPillText}>Resolved</Text>
            </View>
          )}
        </View>
        <Text style={[styles.category, { color: tint }]}>
          {item.location ? `${item.category} · ${item.location}` : item.category}
        </Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={styles.poster}>Posted by {item.postedByName}</Text>

        {item.status === "open" && (
          <View style={styles.actionRow}>
            {!isOwner && (
              <>
                <TouchableOpacity
                  style={styles.contactIconButton}
                  onPress={() => onContact(item, "email")}
                >
                  <Ionicons name="mail-outline" size={16} color={colors.surface} />
                </TouchableOpacity>
                {item.postedByPhone && (
                  <>
                    <TouchableOpacity
                      style={[styles.contactIconButton, styles.callButton]}
                      onPress={() => onContact(item, "call")}
                    >
                      <Ionicons name="call-outline" size={16} color={colors.surface} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contactIconButton, styles.whatsappButton]}
                      onPress={() => onContact(item, "whatsapp")}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color={colors.surface} />
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
            {isOwner && (
              <>
                <TouchableOpacity style={styles.resolveButton} onPress={() => onResolve(item)}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                  <Text style={styles.resolveButtonText}>Mark resolved</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8} style={styles.deleteIcon}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

export default function LostFoundScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const [type, setType] = useState<LostFoundType>("lost");
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Resolved items are hidden from the default feed — an item marked
  // resolved is done, and leaving it in the main list just adds clutter
  // for something nobody needs to act on anymore. This toggle is an
  // escape hatch for a poster wanting to confirm they did mark
  // something resolved, not the default browsing experience.
  const [showResolved, setShowResolved] = useState(false);
  const visibleItems = items.filter((item) => showResolved || item.status !== "resolved");

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToLostFoundItems(type, (data) => {
      setItems(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [type]);

  // Firebase/WhatsApp deep links need a country code — a plain 10-digit
  // Indian number typed without one is the overwhelmingly common case for
  // this specific college app, so that's the one assumption made here.
  // A number already starting with a country code (11+ digits, or
  // already has a + typed) is left as-is.
  const toWhatsAppNumber = (phone: string): string => {
    const digits = phone.replace(/[^\d]/g, "");
    return digits.length === 10 ? `91${digits}` : digits;
  };

  const handleContact = useCallback(
    (item: LostFoundItem, method: "email" | "call" | "whatsapp") => {
      if (method === "email") {
        const subject = `[Lost & Found] ${item.title}`;
        Linking.openURL(`mailto:${item.postedByEmail}?subject=${encodeURIComponent(subject)}`).catch(() => {
          Alert.alert("Couldn't open mail app", `Email them directly at ${item.postedByEmail}`);
        });
      } else if (method === "call" && item.postedByPhone) {
        Linking.openURL(`tel:${item.postedByPhone}`).catch(() => {});
      } else if (method === "whatsapp" && item.postedByPhone) {
        const number = toWhatsAppNumber(item.postedByPhone);
        const message = `Hi, I'm reaching out about your ${item.type} item: "${item.title}"`;
        Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`).catch(() => {
          Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed.");
        });
      }

      // Fire-and-forget — never blocks the actual contact action above,
      // and a failure here (e.g. offline) is silently swallowed since the
      // person already got what they came for (email/call/WhatsApp opened).
      if (profile) {
        notifyLostFoundContact({
          itemId: item.id,
          itemTitle: item.title,
          posterUid: item.postedBy,
          contactedByUid: profile.uid,
          contactedByName: profile.name,
          method,
        }).catch(() => {});
      }
    },
    [profile],
  );

  const handleResolve = useCallback((item: LostFoundItem) => {
    Alert.alert(
      "Mark as resolved?",
      "This hides it from the active feed — do this once the item's been returned/claimed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark resolved",
          onPress: async () => {
            try {
              await resolveLostFoundItem(item.id);
            } catch (err: any) {
              Alert.alert("Couldn't update", err.message ?? "Please try again.");
            }
          },
        },
      ],
    );
  }, []);

  const handleDelete = useCallback((item: LostFoundItem) => {
    Alert.alert("Delete this post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteLostFoundItem(item);
          } catch (err: any) {
            Alert.alert("Delete failed", err.message ?? "Please try again.");
          }
        },
      },
    ]);
  }, []);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <TouchableOpacity
            style={styles.postButton}
            onPress={() => navigation.navigate("PostLostFound", { type })}
          >
            <Ionicons name="add" size={18} color={colors.surface} />
            <Text style={styles.postButtonText}>Post</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, type === "lost" && styles.toggleButtonActive]}
            onPress={() => setType("lost")}
          >
            <Text style={[styles.toggleText, type === "lost" && styles.toggleTextActive]}>Lost</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, type === "found" && styles.toggleButtonActive]}
            onPress={() => setType("found")}
          >
            <Text style={[styles.toggleText, type === "found" && styles.toggleTextActive]}>Found</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setShowResolved((v) => !v)}
          style={styles.showResolvedRow}
        >
          <Ionicons
            name={showResolved ? "checkbox-outline" : "square-outline"}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.showResolvedText}>Show resolved items</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
          </View>
        ) : visibleItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>
              No {type} items posted yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                isOwner={item.postedBy === profile?.uid}
                onContact={handleContact}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  postButtonText: { color: colors.surface, fontWeight: "600", fontSize: 13 },
  toggleRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
  },
  showResolvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  showResolvedText: { fontSize: 13, color: colors.textSecondary },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: "center",
  },
  toggleButtonActive: { backgroundColor: colors.primary },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  toggleTextActive: { color: colors.surface },
  listContent: { padding: spacing.lg, gap: spacing.md },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...clayShadowSoft,
  },
  cardResolved: { opacity: 0.6 },
  photo: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.background },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  resolvedPill: { backgroundColor: colors.success + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  resolvedPillText: { fontSize: 11, fontWeight: "600", color: colors.success },
  category: { fontSize: 12, fontWeight: "600" },
  description: { ...typography.caption, color: colors.textSecondary },
  poster: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  contactIconButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  callButton: { backgroundColor: colors.success },
  whatsappButton: { backgroundColor: "#25D366" },
  resolveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  resolveButtonText: { color: colors.success, fontSize: 12, fontWeight: "600" },
  deleteIcon: { padding: 4 },
});
