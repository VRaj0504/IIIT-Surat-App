import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import ClayCard from "../components/ClayCard";
import {
  subscribeToMyOrderHistory,
  MessOrder,
  OrderStatus,
} from "../firebase/messService";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { label: "Preparing", color: colors.accent, icon: "time-outline" },
  ready: { label: "Ready", color: colors.success, icon: "checkmark-circle" },
  served: {
    label: "Collected",
    color: colors.textSecondary,
    icon: "checkmark-done",
  },
  cancelled: { label: "Cancelled", color: colors.danger, icon: "close-circle" },
};

function formatDate(ts: MessOrder["createdAt"]): string {
  if (!ts) return "";
  const d = ts.toDate();
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function MessOrderHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<MessOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeToMyOrderHistory(profile.uid, (data) => {
      setOrders(data);
      setLoading(false);
    });
    return unsub;
  }, [profile?.uid]);

  const handleReorder = (order: MessOrder) => {
    navigation.navigate("MessOrder", { reorderItems: order.items });
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>Order History</Text>

        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.lg }}
          />
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>
            No orders yet — your past mess orders will show up here.
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {orders.map((order) => {
              const status = statusConfig[order.status];
              const itemSummary = order.items
                .map((line) => `${line.qty}× ${line.name}`)
                .join(", ");
              return (
                <ClayCard key={order.id} soft style={styles.card}>
                  <View style={styles.topRow}>
                    <Text style={styles.token}>{order.tokenNumber}</Text>
                    <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
                  </View>
                  <Text style={styles.items} numberOfLines={2}>
                    {itemSummary}
                  </Text>
                  <View style={styles.bottomRow}>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: status.color + "22" },
                      ]}
                    >
                      <Ionicons name={status.icon} size={13} color={status.color} />
                      <Text style={[styles.statusText, { color: status.color }]}>
                        {status.label}
                      </Text>
                    </View>
                    <Text style={styles.amount}>₹{order.totalAmount}</Text>
                  </View>
                  {(order.status === "served" || order.status === "cancelled") && (
                    <TouchableOpacity
                      style={styles.reorderBtn}
                      onPress={() => handleReorder(order)}
                    >
                      <Ionicons name="refresh" size={14} color={colors.primary} />
                      <Text style={styles.reorderText}>Reorder</Text>
                    </TouchableOpacity>
                  )}
                </ClayCard>
              );
            })}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  list: { paddingBottom: spacing.xl },
  card: { padding: spacing.md, marginBottom: spacing.sm },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  token: { ...typography.h3, color: colors.primary, fontWeight: "800" },
  date: { ...typography.caption, color: colors.textSecondary },
  items: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },
  statusText: { ...typography.caption, fontWeight: "700" },
  amount: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  reorderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    ...clayShadowSoft,
  },
  reorderText: { ...typography.caption, color: colors.primary, fontWeight: "700" },
});
