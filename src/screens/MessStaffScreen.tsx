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
  staffCancelOrder,
  subscribeToQueue,
  MessOrder,
  subscribeToPendingRecharges,
  approveRecharge,
  rejectRecharge,
  WalletTransaction,
  subscribeToAllMenuItems,
  setDailyQuantity,
  clearDailyQuantity,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  MessMenuItem,
  MessCategory,
  getMonthlyMessStats,
  MonthlyMessStats,
} from "../firebase/messService";

type Tab = "queue" | "verify" | "recharges" | "stock" | "menu" | "stats";
const MENU_CATEGORIES: MessCategory[] = ["Thali", "Snacks", "Beverages"];

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

  // New-item form for the Menu tab.
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<MessCategory>("Thali");
  const [addingItem, setAddingItem] = useState(false);
  // Inline edit drafts, keyed by item id — only items currently being
  // edited have an entry here.
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { name: string; price: string; category: MessCategory }>
  >({});
  const [menuBusyId, setMenuBusyId] = useState<string | null>(null);

  const [statsMonth, setStatsMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [stats, setStats] = useState<MonthlyMessStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (tab !== "stats") return;
    let cancelled = false;
    setStatsLoading(true);
    getMonthlyMessStats(statsMonth.year, statsMonth.month)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, statsMonth]);

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

  const handleAddItem = async () => {
    const price = parseFloat(newItemPrice);
    if (!newItemName.trim()) {
      Alert.alert("Enter a name", "Type what the item is called.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("Enter a price", "Type a valid price in ₹.");
      return;
    }
    setAddingItem(true);
    try {
      await addMenuItem(newItemName.trim(), newItemCategory, price);
      setNewItemName("");
      setNewItemPrice("");
    } catch (e: any) {
      Alert.alert("Could not add item", e?.message ?? "Please try again.");
    } finally {
      setAddingItem(false);
    }
  };

  const startEditItem = (item: MessMenuItem) => {
    setEditDrafts((prev) => ({
      ...prev,
      [item.id]: { name: item.name, price: String(item.price), category: item.category },
    }));
  };

  const cancelEditItem = (itemId: string) => {
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleSaveEditItem = async (itemId: string) => {
    const draft = editDrafts[itemId];
    if (!draft) return;
    const price = parseFloat(draft.price);
    if (!draft.name.trim()) {
      Alert.alert("Enter a name", "Item name can't be empty.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("Enter a price", "Type a valid price in ₹.");
      return;
    }
    setMenuBusyId(itemId);
    try {
      await updateMenuItem(itemId, {
        name: draft.name.trim(),
        category: draft.category,
        price,
      });
      cancelEditItem(itemId);
    } catch (e: any) {
      Alert.alert("Could not save changes", e?.message ?? "Please try again.");
    } finally {
      setMenuBusyId(null);
    }
  };

  const handleDeleteItem = (item: MessMenuItem) => {
    Alert.alert(
      `Delete ${item.name}?`,
      "This removes it from the menu for good. Past orders keep their own record of it, so order history is unaffected. If you just want to pause it for today, use the Stock tab and set it to 0 instead.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMenuBusyId(item.id);
            try {
              await deleteMenuItem(item.id);
            } catch (e: any) {
              Alert.alert("Could not delete", e?.message ?? "Please try again.");
            } finally {
              setMenuBusyId(null);
            }
          },
        },
      ],
    );
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

  const handleServe = async () => {
    if (!foundOrder || !profile?.uid) return;
    try {
      await markOrderServed(foundOrder.id, profile.uid);
      setFoundOrder({ ...foundOrder, status: "served" });
    } catch (e: any) {
      Alert.alert("Could not mark served", e?.message ?? "Please try again.");
    }
  };

  // Mark ready straight from the live queue, as orders come in — not gated
  // on the student being physically at the counter. Doing this ambiently is
  // what keeps the counter itself down to a single fast tap instead of a
  // full check each time someone walks up. There's no "confirm payment"
  // step here anymore — every order in this queue was already paid for out
  // of the student's wallet the instant it was placed.
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

  // Serve directly from the queue once an order is "ready" — closes the
  // loop without staff having to switch to the Verify tab and re-look-up
  // the same order they're already looking at.
  const handleQueueServe = async (order: MessOrder) => {
    if (!profile?.uid) return;
    setQueueActionId(order.id);
    try {
      await markOrderServed(order.id, profile.uid);
    } catch (e: any) {
      Alert.alert("Could not mark served", e?.message ?? "Please try again.");
    } finally {
      setQueueActionId(null);
    }
  };

  // No-show / mistaken-order cancellation, refunded to the student
  // immediately (staff is already trusted with wallet writes, so this
  // doesn't need the pending-approval detour a student's own cancel does).
  const handleQueueCancel = (order: MessOrder) => {
    if (!profile?.uid) return;
    Alert.alert(
      `Cancel token ${order.tokenNumber}?`,
      `₹${order.totalAmount} will be refunded to ${order.studentName}'s wallet right away.`,
      [
        { text: "Back", style: "cancel" },
        {
          text: "Cancel & refund",
          style: "destructive",
          onPress: async () => {
            setQueueActionId(order.id);
            try {
              await staffCancelOrder(order.id, profile.uid, "No-show / staff cancelled");
            } catch (e: any) {
              Alert.alert("Could not cancel", e?.message ?? "Please try again.");
            } finally {
              setQueueActionId(null);
            }
          },
        },
      ],
    );
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabRow}
          contentContainerStyle={styles.tabRowContent}
        >
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
          <TouchableOpacity
            style={[styles.tab, tab === "menu" && styles.tabActive]}
            onPress={() => setTab("menu")}
          >
            <Text
              style={[styles.tabText, tab === "menu" && styles.tabTextActive]}
            >
              Menu
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "stats" && styles.tabActive]}
            onPress={() => setTab("stats")}
          >
            <Text
              style={[styles.tabText, tab === "stats" && styles.tabTextActive]}
            >
              Stats
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {tab === "queue" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.helperText}>
              Mark food ready and serve it — all from one screen, no need to
              switch to Verify Token unless a student's showing up without
              you having seen their order come through yet.
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
                      {order.status === "ready" ? (
                        <TouchableOpacity
                          style={styles.queueActionBtn}
                          disabled={busy}
                          onPress={() => handleQueueServe(order)}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.queueActionBtnText}>
                              Serve
                            </Text>
                          )}
                        </TouchableOpacity>
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
                      <TouchableOpacity
                        style={styles.queueCancelBtn}
                        disabled={busy}
                        onPress={() => handleQueueCancel(order)}
                      >
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </TouchableOpacity>
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
                No pending requests.
              </Text>
            ) : (
              pending.map((t) => {
                const isRefund = t.source === "refund";
                return (
                  <View key={t.id} style={styles.rechargeRow}>
                    <View style={styles.rechargeInfo}>
                      <View style={styles.rechargeNameRow}>
                        <Text style={styles.rechargeName}>{t.studentName}</Text>
                        <View
                          style={[
                            styles.sourceBadge,
                            isRefund ? styles.sourceBadgeRefund : styles.sourceBadgeRecharge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sourceBadgeText,
                              { color: isRefund ? colors.danger : colors.success },
                            ]}
                          >
                            {isRefund ? "Refund" : "Recharge"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rechargeAmount}>₹{t.amount}</Text>
                      <Text style={styles.rechargeRef}>
                        {isRefund ? t.reason : `UPI Ref: ${t.upiRefId ?? "—"}`}
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
                );
              })
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

        {tab === "menu" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Add Item</Text>
            <ClayCard soft style={styles.addItemCard}>
              <TextInput
                style={styles.stockInput2}
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="Item name (e.g. Veg Thali)"
                placeholderTextColor={colors.textSecondary}
              />
              <View style={styles.categoryPickerRow}>
                {MENU_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryPickerChip,
                      newItemCategory === cat && styles.categoryPickerChipActive,
                    ]}
                    onPress={() => setNewItemCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryPickerText,
                        newItemCategory === cat && styles.categoryPickerTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addItemBottomRow}>
                <TextInput
                  style={[styles.stockInput2, { flex: 1 }]}
                  value={newItemPrice}
                  onChangeText={(v) => setNewItemPrice(v.replace(/[^0-9.]/g, ""))}
                  placeholder="Price (₹)"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.addItemBtn}
                  onPress={handleAddItem}
                  disabled={addingItem}
                >
                  {addingItem ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.stockSetBtnText}>Add Item</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ClayCard>

            <Text style={styles.sectionTitle}>All Items</Text>
            {menuItems.length === 0 ? (
              <Text style={styles.helperText}>No items on the menu yet.</Text>
            ) : (
              menuItems.map((item) => {
                const draft = editDrafts[item.id];
                const busy = menuBusyId === item.id;
                if (draft) {
                  return (
                    <ClayCard key={item.id} soft style={styles.editItemCard}>
                      <TextInput
                        style={styles.stockInput2}
                        value={draft.name}
                        onChangeText={(v) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], name: v },
                          }))
                        }
                        placeholderTextColor={colors.textSecondary}
                      />
                      <View style={styles.categoryPickerRow}>
                        {MENU_CATEGORIES.map((cat) => (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.categoryPickerChip,
                              draft.category === cat && styles.categoryPickerChipActive,
                            ]}
                            onPress={() =>
                              setEditDrafts((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], category: cat },
                              }))
                            }
                          >
                            <Text
                              style={[
                                styles.categoryPickerText,
                                draft.category === cat && styles.categoryPickerTextActive,
                              ]}
                            >
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.addItemBottomRow}>
                        <TextInput
                          style={[styles.stockInput2, { flex: 1 }]}
                          value={draft.price}
                          onChangeText={(v) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], price: v.replace(/[^0-9.]/g, "") },
                            }))
                          }
                          keyboardType="decimal-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                        <TouchableOpacity
                          style={styles.stockClearBtn}
                          onPress={() => cancelEditItem(item.id)}
                          disabled={busy}
                        >
                          <Text style={styles.stockClearBtnText}>✕</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.addItemBtn}
                          onPress={() => handleSaveEditItem(item.id)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.stockSetBtnText}>Save</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </ClayCard>
                  );
                }
                return (
                  <View key={item.id} style={styles.stockRow}>
                    <View style={styles.stockInfo}>
                      <Text style={styles.rechargeName}>{item.name}</Text>
                      <Text style={styles.rechargeRef}>
                        {item.category} · ₹{item.price}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.stockClearBtn}
                      onPress={() => startEditItem(item)}
                      disabled={busy}
                    >
                      <Ionicons name="pencil" size={15} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.stockClearBtn}
                      onPress={() => handleDeleteItem(item)}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.danger} size="small" />
                      ) : (
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {tab === "stats" && (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.monthPicker}>
              <TouchableOpacity
                onPress={() =>
                  setStatsMonth((m) => {
                    const d = new Date(m.year, m.month - 2, 1);
                    return { year: d.getFullYear(), month: d.getMonth() + 1 };
                  })
                }
              >
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {new Date(statsMonth.year, statsMonth.month - 1, 1).toLocaleDateString(
                  "en-US",
                  { month: "long", year: "numeric" },
                )}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setStatsMonth((m) => {
                    const d = new Date(m.year, m.month, 1);
                    return { year: d.getFullYear(), month: d.getMonth() + 1 };
                  })
                }
              >
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {statsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : stats ? (
              <>
                <View style={styles.statsSummaryRow}>
                  <View style={styles.statsSummaryCard}>
                    <Text style={styles.statsSummaryValue}>{stats.totalOrders}</Text>
                    <Text style={styles.statsSummaryLabel}>Orders</Text>
                  </View>
                  <View style={styles.statsSummaryCard}>
                    <Text style={styles.statsSummaryValue}>₹{stats.totalRevenue}</Text>
                    <Text style={styles.statsSummaryLabel}>Revenue</Text>
                  </View>
                  <View style={styles.statsSummaryCard}>
                    <Text style={styles.statsSummaryValue}>
                      {stats.avgRating !== null ? stats.avgRating.toFixed(1) : "—"}
                    </Text>
                    <Text style={styles.statsSummaryLabel}>
                      Avg rating{stats.ratingCount > 0 ? ` (${stats.ratingCount})` : ""}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Most Ordered</Text>
                {stats.itemStats.length === 0 ? (
                  <Text style={styles.helperText}>No served orders this month yet.</Text>
                ) : (
                  stats.itemStats.map((s) => (
                    <View key={s.itemId} style={styles.statsItemRow}>
                      <Text style={styles.rechargeName}>{s.name}</Text>
                      <Text style={styles.rechargeRef}>
                        {s.qty} sold · ₹{s.revenue}
                      </Text>
                    </View>
                  ))
                )}
              </>
            ) : null}
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
  tabRow: { flexGrow: 0, marginBottom: spacing.md },
  tabRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  monthLabel: {
    ...typography.h3,
    color: colors.textPrimary,
    minWidth: 160,
    textAlign: "center",
  },
  statsSummaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statsSummaryCard: {
    flex: 1,
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...clayShadowSoft,
  },
  statsSummaryValue: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: "800",
  },
  statsSummaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.claySurface,
    alignItems: "center",
    justifyContent: "center",
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
  queueCancelBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.danger + "12",
    alignItems: "center",
    justifyContent: "center",
  },
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
  rechargeNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rechargeName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  sourceBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.full,
  },
  sourceBadgeRecharge: { backgroundColor: colors.success + "1A" },
  sourceBadgeRefund: { backgroundColor: colors.danger + "1A" },
  sourceBadgeText: { ...typography.caption, fontWeight: "700", fontSize: 11 },
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
  // ---------- Menu tab (add/edit item form) ----------
  addItemCard: { padding: spacing.md, marginBottom: spacing.lg, gap: spacing.sm },
  editItemCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  stockInput2: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
  },
  categoryPickerRow: { flexDirection: "row", gap: spacing.xs },
  categoryPickerChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  categoryPickerChipActive: { backgroundColor: colors.primary },
  categoryPickerText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  categoryPickerTextActive: { color: "#fff" },
  addItemBottomRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addItemBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
});