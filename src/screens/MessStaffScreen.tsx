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
  MessOrder,
  subscribeToPendingRecharges,
  approveRecharge,
  rejectRecharge,
  WalletTransaction,
} from "../firebase/messService";

type Tab = "verify" | "recharges";

export default function MessStaffScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("verify");

  const [tokenInput, setTokenInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundOrder, setFoundOrder] = useState<MessOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLock, setScanLock] = useState(false);

  const [pending, setPending] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    const unsub = subscribeToPendingRecharges(setPending);
    return unsub;
  }, []);

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
        </View>

        {tab === "verify" ? (
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
        ) : (
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
