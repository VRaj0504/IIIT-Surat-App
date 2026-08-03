import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadow,
} from "../theme/theme";
import ClayCard from "../components/ClayCard";
import {
  subscribeToOrder,
  subscribeToQueue,
  estimateWaitMinutes,
  MessOrder,
  OrderStatus,
} from "../firebase/messService";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "MessToken">;

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { label: "Preparing", color: colors.accent, icon: "time-outline" },
  ready: {
    label: "Ready — collect now",
    color: colors.success,
    icon: "checkmark-circle",
  },
  served: {
    label: "Collected",
    color: colors.textSecondary,
    icon: "checkmark-done",
  },
  cancelled: { label: "Cancelled", color: colors.danger, icon: "close-circle" },
};

export default function MessTokenScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { orderId } = route.params;

  const [order, setOrder] = useState<MessOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<MessOrder[]>([]);

  useEffect(() => {
    const unsub = subscribeToOrder(orderId, (o) => {
      setOrder(o);
      setLoading(false);
    });
    return unsub;
  }, [orderId]);

  useEffect(() => {
    const unsub = subscribeToQueue(setQueue);
    return unsub;
  }, []);

  if (loading || !order) {
    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container} edges={["top"]}>
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.xl }}
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const status = statusConfig[order.status];
  const paymentConfirmed = order.paymentStatus === "paid";
  // Position in the live queue — only meaningful while still "pending"
  // (once "ready" the student is already being served, no ETA needed).
  const queueIndex = queue.findIndex((o) => o.id === order.id);
  const ordersAhead = queueIndex >= 0 ? queueIndex : null;
  const etaMinutes = ordersAhead !== null ? estimateWaitMinutes(ordersAhead) : null;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.navigate("Tabs")}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.centerWrap}>
          <View style={[styles.ticket, clayShadow]}>
            <Text style={styles.tokenLabel}>YOUR TOKEN</Text>
            <Text style={styles.tokenNumber}>{order.tokenNumber || "—"}</Text>

            <View
              style={[
                styles.statusPill,
                { backgroundColor: status.color + "22" },
              ]}
            >
              <Ionicons name={status.icon} size={16} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>

            {order.pickupSlot && (
              <View style={[styles.statusPill, { backgroundColor: "#e6f4ea" }]}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  Collect around {order.pickupSlot} — no need to queue early
                </Text>
              </View>
            )}

            {order.status === "pending" && ordersAhead !== null && (
              <View style={[styles.statusPill, { backgroundColor: "#eef2ff" }]}>
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  {ordersAhead === 0
                    ? "You're next in line"
                    : `${ordersAhead} order${ordersAhead === 1 ? "" : "s"} ahead — ~${etaMinutes} min`}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: paymentConfirmed
                    ? colors.success + "22"
                    : "#fff6dd",
                },
              ]}
            >
              <Ionicons
                name={paymentConfirmed ? "checkmark-circle-outline" : "hourglass-outline"}
                size={16}
                color={paymentConfirmed ? colors.success : "#8a6d00"}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: paymentConfirmed ? colors.success : "#8a6d00" },
                ]}
              >
                {paymentConfirmed
                  ? "Payment confirmed"
                  : "Payment pending confirmation"}
              </Text>
            </View>

            <View style={styles.qrWrap}>
              {order.tokenNumber ? (
                <QRCode
                  value={order.id}
                  size={160}
                  color={colors.textPrimary}
                  backgroundColor="#fff"
                />
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </View>
            <Text style={styles.qrHint}>
              Show this QR at the counter, or tell them your token number
            </Text>

            <View style={styles.divider} />

            {order.items.map((line) => (
              <View key={line.itemId} style={styles.itemRow}>
                <Text style={styles.itemText}>
                  {line.qty} × {line.name}
                </Text>
                <Text style={styles.itemPrice}>₹{line.price * line.qty}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.itemRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>₹{order.totalAmount}</Text>
            </View>
          </View>

          <ClayCard
            soft
            style={styles.ordersLink}
            onPress={() => navigation.navigate("MessMenu")}
          >
            <Text style={styles.ordersLinkText}>Order more food</Text>
          </ClayCard>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  closeBtn: { alignSelf: "flex-end", marginTop: spacing.sm },
  centerWrap: { flex: 1, justifyContent: "center", paddingBottom: spacing.xl },
  ticket: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: "center",
  },
  tokenLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    letterSpacing: 2,
    fontWeight: "700",
  },
  tokenNumber: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  statusText: { ...typography.caption, fontWeight: "700" },
  qrWrap: {
    padding: spacing.sm,
    backgroundColor: "#fff",
    marginBottom: spacing.sm,
  },
  qrHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 4,
  },
  itemText: { ...typography.body, color: colors.textPrimary },
  itemPrice: { ...typography.body, color: colors.textSecondary },
  totalLabel: { ...typography.h3, color: colors.textPrimary },
  totalValue: { ...typography.h3, color: colors.primary },
  ordersLink: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  ordersLinkText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
});