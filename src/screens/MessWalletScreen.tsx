import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
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
  subscribeToWalletBalance,
  subscribeToMyTransactions,
  requestRecharge,
  buildUpiRechargeUrl,
  WalletTransaction,
} from "../firebase/messService";

const QUICK_AMOUNTS = [50, 100, 200, 500];

export default function MessWalletScreen() {
  const { profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTransaction[]>([]);
  const [amount, setAmount] = useState("");
  const [upiRef, setUpiRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub1 = subscribeToWalletBalance(profile.uid, setBalance);
    const unsub2 = subscribeToMyTransactions(profile.uid, setTxns);
    return () => {
      unsub1();
      unsub2();
    };
  }, [profile?.uid]);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!profile?.uid || !amt || amt <= 0) {
      Alert.alert("Enter an amount", "Please enter a valid recharge amount.");
      return;
    }
    if (!upiRef.trim()) {
      Alert.alert(
        "UPI reference required",
        "Enter the UPI transaction ID / reference number from your payment, so mess staff can verify it.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await requestRecharge(profile.uid, profile.name, amt, upiRef.trim());
      setAmount("");
      setUpiRef("");
      Alert.alert(
        "Request sent",
        "Your recharge will reflect once mess staff verifies the payment.",
      );
    } catch (e: any) {
      Alert.alert("Could not submit", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Mess Wallet</Text>

          <View style={[styles.balanceCard, clayShadow]}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceValue}>₹{balance}</Text>
          </View>

          <Text style={styles.sectionTitle}>Recharge Wallet</Text>
          <ClayCard soft style={styles.rechargeCard}>
            <Text style={styles.helperText}>
              Pay the mess office via UPI (or in person), then submit the amount
              and UPI reference here. Mess staff will verify and credit your
              wallet.
            </Text>

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={styles.quickChip}
                  onPress={() => setAmount(String(a))}
                >
                  <Text style={styles.quickChipText}>₹{a}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="e.g. 200"
              placeholderTextColor={colors.textSecondary}
            />

            <TouchableOpacity
              style={styles.payUpiBtn}
              onPress={async () => {
                const amt = parseFloat(amount);
                if (!amt || amt <= 0) {
                  Alert.alert(
                    "Enter an amount",
                    "Enter how much you want to add before opening your UPI app.",
                  );
                  return;
                }
                const url = buildUpiRechargeUrl(amt);
                const canOpen = await Linking.canOpenURL(url);
                if (canOpen) {
                  Linking.openURL(url);
                } else {
                  Alert.alert(
                    "No UPI app found",
                    "Pay the canteen directly using its QR code instead.",
                  );
                }
              }}
            >
              <Ionicons name="qr-code-outline" size={16} color={colors.primary} />
              <Text style={styles.payUpiBtnText}>Pay via UPI app</Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>UPI Transaction ID</Text>
            <TextInput
              style={styles.input}
              value={upiRef}
              onChangeText={setUpiRef}
              placeholder="e.g. 402812345678"
              placeholderTextColor={colors.textSecondary}
            />

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  Submit Recharge Request
                </Text>
              )}
            </TouchableOpacity>
          </ClayCard>

          <Text style={styles.sectionTitle}>History</Text>
          {txns.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : (
            txns.map((t) => (
              <View key={t.id} style={styles.txnRow}>
                <View
                  style={[
                    styles.txnIconWrap,
                    {
                      backgroundColor:
                        (t.type === "credit" ? colors.success : colors.danger) +
                        "1A",
                    },
                  ]}
                >
                  <Ionicons
                    name={t.type === "credit" ? "arrow-down" : "arrow-up"}
                    size={16}
                    color={t.type === "credit" ? colors.success : colors.danger}
                  />
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnReason}>{t.reason}</Text>
                  {t.status === "pending" && (
                    <Text style={styles.txnPending}>Pending verification</Text>
                  )}
                  {t.status === "rejected" && (
                    <Text style={styles.txnRejected}>Rejected</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.txnAmount,
                    {
                      color:
                        t.type === "credit"
                          ? colors.success
                          : colors.textPrimary,
                    },
                  ]}
                >
                  {t.type === "credit" ? "+" : "−"}₹{t.amount}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  scrollContent: { paddingBottom: spacing.xl },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  balanceLabel: { ...typography.caption, color: "rgba(255,255,255,0.8)" },
  balanceValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#fff",
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  rechargeCard: { padding: spacing.md, marginBottom: spacing.lg },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  quickRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  quickChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
    ...clayShadowSoft,
  },
  quickChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
    ...clayShadowSoft,
  },
  payUpiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 8,
    marginTop: spacing.sm,
    ...clayShadowSoft,
  },
  payUpiBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.md,
  },
  submitBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  emptyText: { ...typography.body, color: colors.textSecondary },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.claySurface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  txnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  txnInfo: { flex: 1 },
  txnReason: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  txnPending: { ...typography.caption, color: colors.accent, marginTop: 2 },
  txnRejected: { ...typography.caption, color: colors.danger, marginTop: 2 },
  txnAmount: { ...typography.body, fontWeight: "700" },
});
