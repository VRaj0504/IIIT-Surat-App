import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../theme/theme";
import { acknowledgeMeeting, meetingWhen, type Meeting } from "../firebase/meetingsService";

export default function MeetingCard({
  m,
  uid,
  name,
  role,
  compact = false,
  onPress,
}: {
  m: Meeting;
  uid: string;
  name: string;
  role: string;
  compact?: boolean;
  onPress?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const cancelled = m.status === "cancelled";
  const confirmed = m.acked || done;

  const ack = async () => {
    setBusy(true);
    setErr("");
    try {
      await acknowledgeMeeting(m.id, uid, name, role);
      setDone(true);
    } catch {
      setErr("Couldn't confirm. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity activeOpacity={onPress ? 0.85 : 1} onPress={onPress} disabled={!onPress} style={[styles.card, cancelled && styles.cardCancelled]}>
      <View style={styles.top}>
        <View style={[styles.icon, cancelled && { backgroundColor: colors.dangerBg }]}>
          <Ionicons name={cancelled ? "close-circle" : "people"} size={18} color={cancelled ? colors.dangerText : colors.tile.blue.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, cancelled && { color: colors.dangerText }]}>
            {cancelled ? "Meeting cancelled" : `Meeting · ${m.createdByName || "Director's office"}`}
          </Text>
          <Text style={[styles.title, cancelled && styles.strike]} numberOfLines={compact ? 2 : undefined}>
            {m.title}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
        <Text style={styles.meta}>{meetingWhen(m)}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
        <Text style={styles.meta}>{m.venue}</Text>
      </View>
      {!!m.agenda && !compact && <Text style={styles.agenda}>{m.agenda}</Text>}
      {!cancelled && (
        <TouchableOpacity
          style={[styles.ack, confirmed && styles.ackDone]}
          onPress={ack}
          disabled={confirmed || busy}
          activeOpacity={0.85}
          accessibilityLabel={confirmed ? "Confirmed" : "Got it"}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name={confirmed ? "checkmark-circle" : "checkmark"} size={17} color={confirmed ? colors.successFg : colors.onPrimary} />
              <Text style={[styles.ackText, confirmed && { color: colors.successFg }]}>{confirmed ? "You confirmed" : "Got it, I'll be there"}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {!!err && <Text style={styles.err}>{err}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  cardCancelled: { borderLeftColor: colors.danger, opacity: 0.85 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.tile.blue.bg },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", color: colors.primary },
  title: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginTop: 1 },
  strike: { textDecorationLine: "line-through" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 13.5, fontWeight: "600", color: colors.textSecondary, flex: 1 },
  agenda: { fontSize: 13.5, color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, marginTop: 2, lineHeight: 19 },
  ack: { marginTop: 6, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ackDone: { backgroundColor: colors.successBg },
  ackText: { color: colors.onPrimary, fontWeight: "800", fontSize: 14 },
  err: { color: colors.dangerText, fontSize: 12.5, fontWeight: "600" },
});
