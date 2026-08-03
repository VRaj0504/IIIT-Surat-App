import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
  clayShadow,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import ClayCard from "../components/ClayCard";
import {
  findOrderByToken,
  getOrderById,
  markOrderServed,
  markOrderReady,
  confirmPayment,
  subscribeToQueue,
  MessOrder,
  subscribeToPendingRecharges,
  approveRecharge,
  rejectRecharge,
  WalletTransaction,
  subscribeToAllMenuItems,
  setDailyQuantity,
  clearDailyQuantity,
  MessMenuItem,
} from "../firebase/messService";

type Tab = "queue" | "verify" | "recharges" | "stock";

export default function MessStaffScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("queue");

  const [queue, setQueue] = useState<MessOrder[]>([]);
  const [queueActionId, setQueueActionId] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundOrder, setFoundOrder] = useState<MessOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLock, setScanLock] = useState(false);

  const [pending, setPending] = useState<WalletTransaction[]>([]);
  const [menuItems, setMenuItems] = useState<MessMenuItem[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToQueue(setQueue);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToPendingRecharges(setPending);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAllMenuItems(setMenuItems);
    return unsub;
  }, []);

  const handleSetQuantity = async (item: MessMenuItem) => {
    const raw = qtyDrafts[item.id];
    const parsed = raw === undefined ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert("Enter a number", "Type how many are available today (0 or more).");
      return;
    }
    setSavingItemId(item.id);
    try {
      await setDailyQuantity(item.id, parsed);
      setQtyDrafts((prev) => ({ ...prev, [item.id]: "" }));
    } catch (e: any) {
      Alert.alert("Could not update stock", e?.message ?? "Please try again.");
    } finally {
      setSavingItemId(null);
    }
  };

  const handleClearQuantity = async (item: MessMenuItem) => {
    setSavingItemId(item.id);
    try {
      await clearDailyQuantity(item.id);
    } catch (e: any) {
      Alert.alert("Could not update stock", e?.message ?? "Please try again.");
    } finally {
      setSavingItemId(null);
    }
  };

  const lookupToken = async () => {
    if (!tokenInput.trim()) return;
    setLookupLoading(true);
    setNotFound(false);
    setFoundOrder(null);
    try {
      const order = await findOrderByToken(tokenInput);
      if (order) setFoundOrder(order);
      else setNotFound(true);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleScan = async (data: string) => {
    if (scanLock) return;
    setScanLock(true);
    setScanning(false);
    setLookupLoading(true);
    setNotFound(false);
    setFoundOrder(null);
    try {
      const order = await getOrderById(data);
      if (order && (order.status === "pending" || order.status === "ready"))
        setFoundOrder(order);
      else setNotFound(true);
    } finally {
      setLookupLoading(false);
      setTimeout(() => setScanLock(false), 1500);
    }
  };

  const handleConfirmPayment = async () => {
    if (!foundOrder || !profile?.uid) return;
    try {
      await confirmPayment(foundOrder.id, profile.uid);
      setFoundOrder({
        ...foundOrder,
        paymentStatus: "paid",
        paymentConfirmedBy: profile.uid,
      });
    } catch (e: any) {
      Alert.alert("Could not confirm payment", e?.message ?? "Please try again.");
    }
  };

  const handleServe = async () => {
    if (!foundOrder || !profile?.uid) return;
    if (foundOrder.paymentStatus !== "paid") {
      Alert.alert(
        "Payment not confirmed",
        "Confirm the payment landed in the canteen's UPI account before serving.",
      );
      return;
    }
    try {
      await markOrderServed(foundOrder.id, profile.uid);
      setFoundOrder({ ...foundOrder, status: "served" });
    } catch (e: any) {
      Alert.alert("Could not mark served", e?.message ?? "Please try again.");
    }
  };

  // Confirm payment / mark ready straight from the live queue, as orders
  // come in — not gated on the student being physically at the counter.
  // Doing this ambiently is what keeps the counter itself down to a single
  // fast tap instead of a full check each time someone walks up.
  const handleQueueConfirmPayment = async (order: MessOrder) => {
    if (!profile?.uid) return;
    setQueueActionId(order.id);
    try {
      await confirmPayment(order.id, profile.uid);
    } catch (e: any) {
      Alert.alert("Could not confirm payment", e?.message ?? "Please try again.");
    } finally {
      setQueueActionId(null);
    }
  };

  const handleQueueMarkReady = async (order: MessOrder) => {
    if (!profile?.uid) return;
    setQueueActionId(order.id);
    try {
      await markOrderReady(order.id, profile.uid);
    } catch (e: any) {
      Alert.alert("Could not mark ready", e?.message ?? "Please try again.");
    } finally {
      setQueueActionId(null);
    }
  };

  const handleApprove = async (txn: WalletTransaction) => {
    if (!profile?.uid) return;
    try {
      await approveRecharge(txn.id, profile.uid);
    } catch (e: any) {
      Alert.alert("Could not approve", e?.message ?? "Please try again.");
    }
  };

  const handleReject = async (txn: WalletTransaction) => {
    if (!profile?.uid) return;
    try {
      await rejectRecharge(txn.id, profile.uid);
    } catch (e: any) {
      Alert.alert("Could not reject", e?.message ?? "Please try again.");
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>Mess Counter</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === "queue" && styles.tabActive]}
            onPress={() => setTab("queue")}
          >
            <Text
              style={[styles.tabText, tab === "queue" && styles.tabTextActive]}
            >
              Queue{queue.length > 0 ? ` (${queue.length})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "verify" && styles.tabActive]}
            onPress={() => setTab("verify")}
          >
            <Text
              style={[styles.tabText, tab === "verify" && styles.tabTextActive]}
            >
              Verify Token
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "recharges" && styles.tabActive]}
            onPress={() => setTab("recharges")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "recharges" && styles.tabTextActive,
              ]}
            >
              Recharges{pending.length > 0 ? ` (${pending.length})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "stock" && styles.tabActive]}
            onPress={() => setTab("stock")}
          >
            <Text
              style={[styles.tabText, tab === "stock" && styles.tabTextActive]}
            >
              Stock
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "queue" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.helperText}>
              Confirm payments and mark food ready here as orders come in —
              students only need a quick tap-and-go at the counter once
              both are done, instead of everyone waiting while you check
              each order from scratch.
            </Text>
            {queue.length === 0 ? (
              <Text style={[styles.helperText, { marginTop: spacing.md }]}>
                No active orders right now.
              </Text>
            ) : (
              queue.map((order) => {
                const busy = queueActionId === order.id;
                const itemSummary = order.items
                  .map((line) => `${line.qty}× ${line.name}`)
                  .join(", ");
                return (
                  <View key={order.id} style={styles.queueRow}>
                    <View style={styles.queueTopRow}>
                      <Text style={styles.queueToken}>{order.tokenNumber}</Text>
                      <Text style={styles.queueAmount}>
                        ₹{order.totalAmount}
                      </Text>
                    </View>
                    <Text style={styles.queueName}>{order.studentName}</Text>
                    <Text style={styles.queueItems} numberOfLines={2}>
                      {itemSummary}
                    </Text>
                    {order.pickupSlot && (
                      <Text style={styles.queueSlot}>
                        Pickup slot: {order.pickupSlot}
                      </Text>
                    )}
                    <View style={styles.queueActionsRow}>
                      {order.paymentStatus === "paid" ? (
                        <View style={styles.queueDoneBadge}>
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={colors.success}
                          />
                          <Text style={styles.queueDoneText}>Paid</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.queueActionBtn}
                          disabled={busy}
                          onPress={() => handleQueueConfirmPayment(order)}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.queueActionBtnText}>
                              Confirm Payment
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}

                      {order.status === "ready" ? (
                        <View style={styles.queueDoneBadge}>
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={colors.success}
                          />
                          <Text style={styles.queueDoneText}>Ready</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.queueActionBtn,
                            styles.queueActionBtnSecondary,
                          ]}
                          disabled={busy}
                          onPress={() => handleQueueMarkReady(order)}
                        >
                          {busy ? (
                            <ActivityIndicator
                              color={colors.primary}
                              size="small"
                            />
                          ) : (
                            <Text
                              style={[
                                styles.queueActionBtnText,
                                styles.queueActionBtnTextSecondary,
                              ]}
                            >
                              Mark Ready
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {tab === "verify" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {scanning ? (
              <View style={styles.cameraWrap}>
                {!permission?.granted ? (
                  <View style={styles.cameraPermission}>
                    <Text style={styles.helperText}>
                      Camera access is needed to scan QR tokens.
                    </Text>
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={requestPermission}
                    >
                      <Text style={styles.primaryBtnText}>
                        Grant Permission
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={(result) => handleScan(result.data)}
                  />
                )}
                <TouchableOpacity
                  style={styles.closeScannerBtn}
                  onPress={() => setScanning(false)}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ClayCard
                  soft
                  style={styles.scanCard}
                  onPress={() => setScanning(true)}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={28}
                    color={colors.primary}
                  />
                  <Text style={styles.scanCardText}>Scan QR Token</Text>
                </ClayCard>

                <Text style={styles.orText}>— or enter manually —</Text>

                <View style={styles.manualRow}>
                  <TextInput
                    style={styles.tokenInput}
                    value={tokenInput}
                    onChangeText={setTokenInput}
                    placeholder="e.g. T-014"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={styles.lookupBtn}
                    onPress={lookupToken}
                  >
                    <Text style={styles.lookupBtnText}>Find</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {lookupLoading && (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginTop: spacing.lg }}
              />
            )}

            {notFound && !lookupLoading && (
              <Text style={styles.notFoundText}>
                No active order found for that token.
              </Text>
            )}

            {foundOrder && !lookupLoading && (
              <View style={[styles.resultCard, clayShadow]}>
                <Text style={styles.resultToken}>{foundOrder.tokenNumber}</Text>
                <Text style={styles.resultName}>{foundOrder.studentName}</Text>
                <View style={styles.divider} />
                {foundOrder.items.map((line) => (
                  <View key={line.itemId} style={styles.itemRow}>
                    <Text style={styles.itemText}>
                      {line.qty} × {line.name}
                    </Text>
                    <Text style={styles.itemPrice}>
                      ₹{line.price * line.qty}
                    </Text>
                  </View>
                ))}
                <View style={styles.divider} />
                <View style={styles.itemRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    ₹{foundOrder.totalAmount}
                  </Text>
                </View>

                {foundOrder.status === "served" ? (
                  <View style={styles.servedBadge}>
                    <Ionicons
                      name="checkmark-done"
                      size={18}
                      color={colors.success}
                    />
                    <Text style={styles.servedBadgeText}>Already served</Text>
                  </View>
                ) : foundOrder.paymentStatus !== "paid" ? (
                  <>
                    <View style={styles.paymentPendingBadge}>
                      <Ionicons
                        name="hourglass-outline"
                        size={16}
                        color="#8a6d00"
                      />
                      <Text style={styles.paymentPendingText}>
                        Payment not yet confirmed — check the canteen's UPI
                        account for ₹{foundOrder.totalAmount} with note "Mess
                        order {foundOrder.tokenNumber}"
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.confirmPaymentBtn}
                      onPress={handleConfirmPayment}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.serveBtnText}>Confirm Payment</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.serveBtn}
                    onPress={handleServe}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.serveBtnText}>Mark as Served</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {tab === "recharges" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {pending.length === 0 ? (
              <Text style={styles.helperText}>
                No pending recharge requests.
              </Text>
            ) : (
              pending.map((t) => (
                <View key={t.id} style={styles.rechargeRow}>
                  <View style={styles.rechargeInfo}>
                    <Text style={styles.rechargeName}>{t.studentName}</Text>
                    <Text style={styles.rechargeAmount}>₹{t.amount}</Text>
                    <Text style={styles.rechargeRef}>
                      UPI Ref: {t.upiRefId ?? "—"}
                    </Text>
                  </View>
                  <View style={styles.rechargeActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(t)}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleApprove(t)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {tab === "stock" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.helperText}>
              Set how many of each item are available today. Leave blank /
              tap "Unlimited" for items you don't want to cap.
            </Text>
            {menuItems.map((item) => (
              <View key={item.id} style={styles.stockRow}>
                <View style={styles.stockInfo}>
                  <Text style={styles.rechargeName}>{item.name}</Text>
                  <Text style={styles.rechargeRef}>
                    {typeof item.remainingQty === "number"
                      ? `${item.remainingQty} left of ${item.dailyQty} today`
                      : "Unlimited"}
                  </Text>
                </View>
                <TextInput
                  style={styles.stockInput}
                  value={qtyDrafts[item.id] ?? ""}
                  onChangeText={(v) =>
                    setQtyDrafts((prev) => ({
                      ...prev,
                      [item.id]: v.replace(/[^0-9]/g, ""),
                    }))
                  }
                  placeholder="qty"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={styles.stockSetBtn}
                  onPress={() => handleSetQuantity(item)}
                  disabled={savingItemId === item.id}
                >
                  <Text style={styles.stockSetBtnText}>Set</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stockClearBtn}
                  onPress={() => handleClearQuantity(item)}
                  disabled={savingItemId === item.id}
                >
                  <Text style={styles.stockClearBtnText}>∞</Text>
                </TouchableOpacity>
              </View>
            ))}
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
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.claySurface,
    alignItems: "center",
    ...clayShadowSoft,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  tabTextActive: { color: "#fff" },
  content: { paddingBottom: spacing.xl },
  scanCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  scanCardText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
  orText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginVertical: spacing.md,
  },
  manualRow: { flexDirection: "row", gap: spacing.sm },
  tokenInput: {
    flex: 1,
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
    ...clayShadowSoft,
  },
  lookupBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  lookupBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  cameraWrap: {
    height: 320,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: spacing.md,
  },
  cameraPermission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  closeScannerBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: radius.full,
    padding: 6,
  },
  helperText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  primaryBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  notFoundText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  resultToken: { fontSize: 32, fontWeight: "800", color: colors.primary },
  resultName: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  itemText: { ...typography.body, color: colors.textPrimary },
  itemPrice: { ...typography.body, color: colors.textSecondary },
  totalLabel: { ...typography.h3, color: colors.textPrimary },
  totalValue: { ...typography.h3, color: colors.primary },
  serveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  serveBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  paymentPendingBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#fff6dd",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  paymentPendingText: {
    ...typography.caption,
    color: "#8a6d00",
    flex: 1,
    fontWeight: "600",
  },
  confirmPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  servedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  servedBadgeText: {
    ...typography.body,
    color: colors.success,
    fontWeight: "700",
  },
  queueRow: {
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  queueTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueToken: { ...typography.h3, color: colors.primary, fontWeight: "800" },
  queueAmount: { ...typography.h3, color: colors.textPrimary },
  queueName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: 2,
  },
  queueItems: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  queueSlot: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 4,
    fontWeight: "600",
  },
  queueActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  queueActionBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  queueActionBtnSecondary: {
    backgroundColor: colors.claySurface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  queueActionBtnText: {
    ...typography.caption,
    color: "#fff",
    fontWeight: "700",
  },
  queueActionBtnTextSecondary: { color: colors.primary },
  queueDoneBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.success + "22",
    borderRadius: radius.md,
    paddingVertical: 8,
  },
  queueDoneText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: "700",
  },
  rechargeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  rechargeInfo: { flex: 1 },
  rechargeName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  rechargeAmount: { ...typography.h3, color: colors.primary, marginTop: 2 },
  rechargeRef: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rechargeActions: { flexDirection: "row", gap: spacing.sm },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...clayShadowSoft,
  },
  stockInfo: { flex: 1 },
  stockInput: {
    width: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    ...typography.body,
    color: colors.textPrimary,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
  },
  stockSetBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  stockSetBtnText: { ...typography.caption, color: "#fff", fontWeight: "700" },
  stockClearBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  stockClearBtnText: { ...typography.body, color: colors.textSecondary },
  rejectBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.danger + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
});