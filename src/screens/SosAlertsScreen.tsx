import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { subscribeToActiveSos, setSosStatus, mapsUrl, SosAlert } from "../firebase/sosService";
import LoadingSpinner from "../components/LoadingSpinner";

const RED = "#DC2626";
const TYPE: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  medical: { label: "Medical", icon: "medkit" },
  safety: { label: "Safety", icon: "shield" },
  other: { label: "Emergency", icon: "alert-circle" },
};

function ago(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
}

// For the doctor, wardens (config/sos) and admins: every SOS still needing
// attention, newest first, live.
export default function SosAlertsScreen() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<SosAlert[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    return subscribeToActiveSos(setAlerts, () => {
      setDenied(true);
      setAlerts([]);
    });
  }, []);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const me = { name: profile?.name ?? "Responder", email: profile?.email ?? "" };
  const act = (a: SosAlert, status: "acknowledged" | "resolved") => {
    const run = () => setSosStatus(a.id, status, me).catch((e) => Alert.alert("Couldn't update", e?.message ?? ""));
    if (status === "resolved") {
      Alert.alert("Mark resolved?", `${a.studentName}'s SOS will close for everyone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Resolved", onPress: run },
      ]);
    } else run();
  };

  if (alerts === null) return <LoadingSpinner style={{ marginTop: spacing.xl }} />;

  return (
    <View style={styles.page}>
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name={denied ? "lock-closed-outline" : "shield-checkmark-outline"} size={28} color={colors.success} />
            </View>
            <Text style={styles.emptyTitle}>{denied ? "Responders only" : "No active SOS"}</Text>
            <Text style={styles.emptySub}>
              {denied
                ? "Only the doctor, the wardens and admins see SOS alerts."
                : "You'll get a notification the moment a student presses SOS."}
            </Text>
          </View>
        }
        renderItem={({ item: a }) => {
          const t = TYPE[a.type] ?? TYPE.other;
          const open = a.status === "open";
          return (
            <View style={[styles.card, open ? styles.cardOpen : styles.cardAck]}>
              <View style={styles.top}>
                <View style={[styles.typeIcon, { backgroundColor: open ? RED : "#F59E0B" }]}>
                  <Ionicons name={t.icon} size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kicker, { color: open ? RED : "#B45309" }]}>
                    {t.label} · {open ? "needs a responder" : `${a.ackBy?.name ?? "Someone"} is on the way`}
                  </Text>
                  <Text style={styles.when}>{a.createdAt ? ago(a.createdAt.toMillis()) : "just now"}</Text>
                </View>
              </View>
              <Text style={styles.name}>{a.studentName}</Text>
              <Text style={styles.meta}>
                {[a.enrollmentNumber, [a.branch, a.section].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
              </Text>
              {!!a.note && <Text style={styles.note}>“{a.note}”</Text>}

              <View style={styles.btnRow}>
                {a.location ? (
                  <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(mapsUrl(a.location!))}>
                    <Ionicons name="navigate" size={16} color={colors.primary} />
                    <Text style={styles.btnText}>Map · {ago(a.location.at)}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.btn, { opacity: 0.6 }]}>
                    <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.btnText, { color: colors.textSecondary }]}>No location</Text>
                  </View>
                )}
                {!!a.phone && (
                  <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(`tel:${a.phone}`)}>
                    <Ionicons name="call" size={16} color={colors.primary} />
                    <Text style={styles.btnText}>Call</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.btnRow}>
                {open && (
                  <TouchableOpacity style={[styles.bigBtn, { backgroundColor: RED }]} onPress={() => act(a, "acknowledged")}>
                    <Text style={styles.bigBtnText}>I'm on my way</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.bigBtn, { backgroundColor: colors.ink }]} onPress={() => act(a, "resolved")}>
                  <Text style={styles.bigBtnText}>Resolved</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { padding: 18, paddingBottom: spacing.xl * 2, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, borderWidth: 2 },
  cardOpen: { borderColor: RED },
  cardAck: { borderColor: "#FCD34D" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  typeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 13, fontWeight: "800" },
  when: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 1 },
  name: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4, color: colors.textPrimary },
  meta: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  note: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginTop: 8, lineHeight: 20 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingVertical: 11,
  },
  btnText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  bigBtn: { flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13 },
  bigBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  empty: { alignItems: "center", paddingTop: 70, gap: 6, paddingHorizontal: 20 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  emptySub: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
});
