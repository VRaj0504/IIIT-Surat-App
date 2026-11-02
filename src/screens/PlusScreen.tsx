import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, Alert, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { usePlus } from "../hooks/usePlus";
import { Segmented, PrimaryButton } from "../components/ui";
import {
  PLUS_PERKS,
  PLUS_PRICES,
  TRIAL_DAYS,
  PlusPlan,
  startPlusCheckout,
  loadRazorpay,
  openRazorpay,
  cancelPlus,
} from "../firebase/plusService";

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function PlusScreen() {
  const { profile } = useAuth();
  const { sub, plus, loading } = usePlus();
  const navigation = useNavigation<any>();
  const [plan, setPlan] = useState<PlusPlan>("yearly");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const isWeb = Platform.OS === "web";
  const price = PLUS_PRICES[plan];

  const subscribe = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const r = await startPlusCheckout(plan);
      await loadRazorpay();
      openRazorpay({
        keyId: r.keyId,
        subscriptionId: r.subscriptionId,
        name: profile.name,
        email: profile.email,
        onPaid: () => {
          setWaiting(true);
          setBusy(false);
          setTimeout(() => setWaiting(false), 20000);
        },
        onDismiss: () => setBusy(false),
      });
    } catch (e: any) {
      setBusy(false);
      Alert.alert("Couldn't start payment", String(e?.message ?? "Try again in a minute.").replace(/^.*?:\s*/, ""));
    }
  };

  const stop = () => {
    Alert.alert(
      "Cancel Plus?",
      sub?.entitledUntil ? `You keep Plus until ${fmt(sub.entitledUntil)}. No more payments after that.` : "No more payments will be taken.",
      [
        { text: "Keep Plus", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cancelPlus();
            } catch (e: any) {
              Alert.alert("Couldn't cancel", String(e?.message ?? "Try again.").replace(/^.*?:\s*/, ""));
            }
            setBusy(false);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={26} color={colors.onPrimary} />
          </View>
          <Text style={styles.title}>CollegeGo Plus</Text>
          <Text style={styles.sub}>Attendance, results, timetable, notices and safety features stay free for everyone.</Text>
        </View>

        <View style={styles.card}>
          {PLUS_PERKS.map((p, i) => (
            <TouchableOpacity
              key={p.title}
              style={[styles.perk, i > 0 && styles.divider]}
              disabled={!plus || !p.route}
              onPress={() => p.route && navigation.navigate(p.route)}
              accessibilityRole={plus && p.route ? "button" : undefined}
            >
              <Ionicons name={p.icon as any} size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.perkTitle}>{p.title}</Text>
                <Text style={styles.perkSub}>{p.sub}</Text>
              </View>
              {plus && p.route ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
            </TouchableOpacity>
          ))}
        </View>

        {loading ? null : plus ? (
          <View style={styles.card}>
            <Text style={styles.stateTitle}>
              {sub?.status === "trial" ? "Free trial running" : sub?.cancelAtCycleEnd ? "Plus ends soon" : "You have Plus"}
            </Text>
            <Text style={styles.stateSub}>
              {sub?.cancelAtCycleEnd ? `Access until ${fmt(sub.entitledUntil)}.` : `Active until ${fmt(sub?.entitledUntil ?? null)}.`}
            </Text>
            {sub && !sub.cancelAtCycleEnd && ["active", "trial", "authenticated", "past_due"].includes(sub.status) ? (
              <PrimaryButton label="Cancel plan" tone="secondary" onPress={stop} loading={busy} style={{ marginTop: 14 }} />
            ) : null}
          </View>
        ) : isWeb ? (
          <View style={styles.card}>
            <Segmented
              options={[
                { value: "yearly", label: "Yearly" },
                { value: "monthly", label: "Monthly" },
              ]}
              value={plan}
              onChange={setPlan}
            />
            <Text style={styles.price}>
              ₹{price.amount}
              <Text style={styles.per}> / {price.per}</Text>
            </Text>
            {plan === "yearly" ? <Text style={styles.save}>About ₹17 a month</Text> : null}
            <Text style={styles.fine}>
              {sub?.trialUsed
                ? "Pay by UPI AutoPay or card. Cancel any time."
                : `${TRIAL_DAYS} days free, then ₹${price.amount} every ${price.per} by UPI AutoPay or card. Cancel any time.`}
            </Text>
            {waiting ? (
              <Text style={styles.waiting}>Confirming your payment…</Text>
            ) : (
              <PrimaryButton label="Continue" onPress={subscribe} loading={busy} style={{ marginTop: 14 }} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: spacing.xl * 2, gap: 14 },
  hero: { backgroundColor: colors.surface, borderRadius: 26, padding: 22, alignItems: "center" },
  badge: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.textPrimary },
  sub: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 18 },
  perk: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  perkTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  perkSub: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: 38, fontWeight: "800", letterSpacing: -1, color: colors.textPrimary, marginTop: 18 },
  per: { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
  save: { fontSize: 13, fontWeight: "700", color: colors.successFg, marginTop: 2 },
  fine: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, lineHeight: 19, marginTop: 10 },
  waiting: { fontSize: 14, fontWeight: "700", color: colors.primary, marginTop: 16, textAlign: "center" },
  stateTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  stateSub: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, marginTop: 4 },
});
