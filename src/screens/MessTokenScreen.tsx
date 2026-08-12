import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  subscribeToFeedbackForOrder,
  submitFeedback,
  estimateWaitMinutes,
  cancelOrder,
  MessOrder,
  MessFeedback,
  OrderStatus,
} from "../firebase/messService";
import { useAuth } from "../context/AuthContext";

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
  const { profile } = useAuth();

  const [order, setOrder] = useState<MessOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<MessOrder[]>([]);
  const [feedback, setFeedback] = useState<MessFeedback[]>([]);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const prevStatusRef = useRef<OrderStatus | null>(null);

  useEffect(() => {
    const unsub = subscribeToOrder(orderId, (o) => {
      // Fire a haptic + alert the moment status flips to "ready" — this is
      // the closest thing to a "your food's up" ping we can do without a
      // push-notification backend (see note in the summary). Only fires on
      // the transition, not on every snapshot while already "ready", and
      // never on the very first load (prevStatusRef starts null).
      if (o && prevStatusRef.current === "pending" && o.status === "ready") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        Alert.alert("Order ready! 🎉", `Token ${o.tokenNumber} — head to the counter.`);
      }
      prevStatusRef.current = o?.status ?? null;
      setOrder(o);
      setLoading(false);
    });
    return unsub;
  }, [orderId]);

  useEffect(() => {
    const unsub = subscribeToQueue(setQueue);
    return unsub;
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeToFeedbackForOrder(orderId, profile.uid, setFeedback);
    return unsub;
  }, [orderId, profile?.uid]);

  const handleRate = async (itemId: string, itemName: string, rating: 1 | 2 | 3 | 4 | 5) => {
    if (!profile?.uid) return;
    setSubmittingItemId(itemId);
    try {
      await submitFeedback(profile.uid, orderId, itemId, itemName, rating, "");
    } catch {
      // Feedback is a nice-to-have, not worth interrupting the student over.
    } finally {
      setSubmittingItemId(null);
    }
  };

  const handleCancel = () => {
    if (!profile?.uid) return;
    Alert.alert(
      "Cancel this order?",
      "Your refund will be credited to your wallet once mess staff verifies the cancellation.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              await cancelOrder(orderId, profile.uid, profile.name);
            } catch (e: any) {
              Alert.alert(
                "Could not cancel",
                e?.message ?? "Please try again, or ask mess staff at the counter.",
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

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

            {order.status === "cancelled" && (
              <View style={[styles.statusPill, { backgroundColor: colors.danger + "15" }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.danger} />
                <Text style={[styles.statusText, { color: colors.danger }]}>
                  {order.cancelledBy === order.uid
                    ? "Refund pending staff verification"
                    : "Refunded to your wallet"}
                </Text>
              </View>
            )}

            <View
              style={[styles.statusPill, { backgroundColor: colors.success + "22" }]}
            >
              <Ionicons name="wallet-outline" size={16} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>
                Paid from wallet
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

            {order.status === "pending" && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                    <Text style={styles.cancelBtnText}>Cancel Order</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {order.status === "served" && (
              <>
                <View style={styles.divider} />
                <Text style={styles.feedbackTitle}>How was it?</Text>
                {order.items.map((line) => {
                  const existing = feedback.find((f) => f.itemId === line.itemId);
                  return (
                    <View key={line.itemId} style={styles.feedbackRow}>
                      <Text style={styles.feedbackItemName}>{line.name}</Text>
                      {existing ? (
                        <View style={styles.feedbackStars}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Ionicons
                              key={n}
                              name={n <= existing.rating ? "star" : "star-outline"}
                              size={18}
                              color={colors.accent}
                            />
                          ))}
                        </View>
                      ) : (
                        <View style={styles.feedbackStars}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              disabled={submittingItemId === line.itemId}
                              onPress={() =>
                                handleRate(line.itemId, line.name, n as 1 | 2 | 3 | 4 | 5)
                              }
                            >
                              <Ionicons
                                name="star-outline"
                                size={20}
                                color={colors.textSecondary}
                              />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>

          <ClayCard
            soft
            style={styles.ordersLink}
            onPress={() => navigation.navigate("MessMenu")}
          >
            <Text style={styles.ordersLinkText}>Order more food</Text>
          </ClayCard>
          <TouchableOpacity
            style={styles.historyLink}
            onPress={() => navigation.navigate("MessOrderHistory")}
          >
            <Text style={styles.historyLinkText}>View order history</Text>
          </TouchableOpacity>
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
  feedbackTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: 6,
  },
  feedbackItemName: { ...typography.body, color: colors.textPrimary },
  feedbackStars: { flexDirection: "row", gap: 4 },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 10,
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.danger + "12",
  },
  cancelBtnText: { ...typography.body, color: colors.danger, fontWeight: "700" },
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
  historyLink: { alignItems: "center", marginTop: spacing.sm },
  historyLinkText: { ...typography.caption, color: colors.textSecondary },
});