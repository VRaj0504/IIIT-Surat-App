import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import {
  getSosConfig,
  raiseSos,
  setSosStatus,
  subscribeToMyActiveSos,
  updateSosLocation,
  saveEmergencyContacts,
  mapsUrl,
  SOS_TYPES,
  SosAlert,
  SosConfig,
  SosLocation,
  SosType,
  EmergencyContact,
} from "../firebase/sosService";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";

const HOLD_MS = 1800;
const RED = "#DC2626";
const RED_DARK = "#991B1B";
const RED_BG = "#FEE2E2";

const NATIONAL = [
  { name: "Emergency", role: "Police · Fire · Ambulance", phone: "112" },
  { name: "Ambulance", role: "Free ambulance", phone: "108" },
];

const call = (phone?: string) => {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/\s+/g, "")}`).catch(() => Alert.alert("Couldn't start the call", phone));
};

function smsUrl(numbers: string[], body: string) {
  const list = numbers.map((n) => n.replace(/\s+/g, "")).join(",");
  return Platform.OS === "ios"
    ? `sms:/open?addresses=${list}&body=${encodeURIComponent(body)}`
    : `sms:${list}?body=${encodeURIComponent(body)}`;
}

async function currentLocation(): Promise<SosLocation | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 7000)),
    ]);
    if (!pos) {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return null;
      return { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? null, at: Date.now() };
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, at: Date.now() };
  } catch {
    return null;
  }
}

function ago(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
}

export default function SOSScreen() {
  const { user, profile } = useAuth();
  const [config, setConfig] = useState<SosConfig | null>(null);
  const [active, setActive] = useState<SosAlert | null>(null);
  const [type, setType] = useState<SosType>("medical");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>(profile?.emergencyContacts ?? []);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    getSosConfig().then(setConfig).catch(() => setConfig(null));
  }, []);
  useEffect(() => {
    if (!user) return;
    return subscribeToMyActiveSos(user.uid, setActive);
  }, [user]);

  const lastSent = useRef(0);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!perm || perm.status !== "granted" || stopped) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 10 },
        (pos) => {
          if (Date.now() - lastSent.current < 15000) return;
          lastSent.current = Date.now();
          updateSosLocation(active.id, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            at: Date.now(),
          }).catch(() => {});
        },
      );
    })();
    return () => {
      stopped = true;
      sub?.remove();
    };
  }, [active?.id]);

  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1200 }), withTiming(0, { duration: 0 })), -1, false);
    return () => cancelAnimation(pulse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.35 }], opacity: 0.35 * (1 - pulse.value) }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.55 + progress.value * 0.45 }], opacity: 0.25 + progress.value * 0.75 }));

  const textContacts = (alert: { location: SosLocation | null } | null, list = contacts) => {
    if (list.length === 0) return;
    const where = alert?.location ? ` My location: ${mapsUrl(alert.location)}` : "";
    const body = `SOS from ${profile?.name ?? "me"} (IIIT Surat). I need help.${where}`;
    Linking.openURL(smsUrl(list.map((c) => c.phone), body)).catch(() => Alert.alert("Couldn't open messages"));
  };

  const send = async () => {
    if (!user || !profile || sending) return;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    try {
      const location = await currentLocation();
      await raiseSos({
        studentUid: user.uid,
        studentName: profile.name,
        enrollmentNumber: profile.enrollmentNumber,
        branch: profile.branch,
        section: profile.section,
        phone: profile.phone,
        type,
        note,
        location,
      });
      setNote("");
      if (!location) {
        Alert.alert(
          "SOS sent — without location",
          "Location is off or not allowed, so responders only have your name and phone. Turn location on, or call them using the buttons below.",
        );
      }
    } catch (e: any) {
      Alert.alert("Couldn't send SOS", `${e?.message ?? "No connection."}\n\nCall 112 or the numbers below instead.`);
    } finally {
      setSending(false);
      progress.value = withTiming(0, { duration: 200 });
    }
  };

  const onPressIn = () => {
    if (sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (done) => {
      if (done) runOnJS(send)();
    });
  };
  const onPressOut = () => {
    if (progress.value < 1) progress.value = withTiming(0, { duration: 180 });
  };

  const cancel = () => {
    if (!active) return;
    Alert.alert("Are you safe?", "This closes your SOS and tells the responders you don't need help any more.", [
      { text: "Keep SOS on", style: "cancel" },
      { text: "I'm safe", style: "destructive", onPress: () => setSosStatus(active.id, "cancelled").catch(() => {}) },
    ]);
  };

  const persistContacts = (next: EmergencyContact[]) => {
    setContacts(next);
    if (user) saveEmergencyContacts(user.uid, next).catch(() => Alert.alert("Couldn't save contacts", "Check your connection."));
  };
  const addContact = () => {
    const phone = newPhone.replace(/[^\d+]/g, "");
    if (!newName.trim() || phone.length < 10) {
      Alert.alert("Add a name and a 10-digit number");
      return;
    }
    persistContacts([...contacts, { name: newName.trim(), phone }].slice(0, 3));
    setNewName("");
    setNewPhone("");
    setAdding(false);
  };

  const responders = [
    ...(config?.wardens ?? []),
    ...(config?.doctor ? [config.doctor] : []),
    ...(config?.helplines ?? []),
  ].filter((r) => r.phone);

  return (
    <View style={styles.page}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {active ? (
          <View style={styles.activeCard}>
            <View style={styles.activeTop}>
              <View style={styles.liveDot} />
              <Text style={styles.activeKicker}>
                SOS {active.status === "acknowledged" ? "· help is coming" : "· sent"}
              </Text>
            </View>
            <Text style={styles.activeTitle}>
              {active.status === "acknowledged"
                ? `${active.ackBy?.name ?? "A responder"} is on the way`
                : "Help has been alerted"}
            </Text>
            <Text style={styles.activeSub}>
              {typeof active.smsSent === "number"
                ? active.smsSent > 0
                  ? `SMS sent to ${active.smsSent} ${active.smsSent === 1 ? "person" : "people"} — your contacts and the committees. `
                  : "SMS couldn't be sent — tap Text my contacts, and call below. "
                : "Sending SMS… "}
              {active.location
                ? `Sharing your location (updated ${ago(active.location.at)}). Keep this screen open if you can.`
                : "No location yet — turn location on, or call using the buttons below."}
            </Text>
            <View style={styles.activeBtns}>
              {contacts.length > 0 && active.smsSent === 0 && (
                <TouchableOpacity style={styles.whiteBtn} onPress={() => textContacts(active)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={RED_DARK} />
                  <Text style={styles.whiteBtnText}>Text my contacts</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ghostBtn} onPress={cancel}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.ghostBtnText}>I'm safe</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.lead}>Press and hold for 2 seconds</Text>
            <Text style={styles.leadSub}>
              An SMS with your location goes to your emergency contacts, the medical committee, the hostel committee,
              the wardens and the doctor.
            </Text>

            <View style={styles.types}>
              {SOS_TYPES.map((t) => {
                const on = t.id === type;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.type, on && styles.typeOn]}
                    onPress={() => setType(t.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={t.icon as any} size={16} color={on ? "#FFFFFF" : RED_DARK} />
                    <Text style={[styles.typeText, on && { color: "#FFFFFF" }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.btnWrap}>
              <Animated.View style={[styles.pulseRing, ringStyle]} />
              <Pressable
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Press and hold to send SOS"
                style={styles.sosBtn}
              >
                <Animated.View style={[styles.sosFill, fillStyle]} />
                <Text style={styles.sosText}>{sending ? "…" : "SOS"}</Text>
                <Text style={styles.sosHint}>{sending ? "Sending" : "Hold"}</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              placeholder="Optional: where you are / what happened"
              placeholderTextColor={colors.textSecondary}
              maxLength={300}
            />
          </>
        )}

        <Text style={styles.groupTitle}>Call now</Text>
        <View style={styles.card}>
          {[...responders, ...NATIONAL].map((r, i) => (
            <TouchableOpacity key={`${r.name}-${r.phone}`} style={[styles.row, i > 0 && styles.rowDivider]} onPress={() => call(r.phone)}>
              <View style={[styles.rowIcon, { backgroundColor: RED_BG }]}>
                <Ionicons name="call" size={16} color={RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.name}</Text>
                <Text style={styles.rowSub}>{r.role}</Text>
              </View>
              <Text style={styles.rowPhone}>{r.phone}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.groupTitle}>My emergency contacts</Text>
        <View style={styles.card}>
          {contacts.length === 0 && !adding && (
            <Text style={styles.empty}>Add up to 3 people (parent, friend). When you press SOS they get an SMS with your location automatically.</Text>
          )}
          {contacts.map((c, i) => (
            <View key={`${c.phone}-${i}`} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.tile.blue.bg }]}>
                <Ionicons name="person" size={16} color={colors.tile.blue.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.rowSub}>{c.phone}</Text>
              </View>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => persistContacts(contacts.filter((_, j) => j !== i))}
                accessibilityLabel={`Remove ${c.name}`}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
          {adding ? (
            <View style={styles.addForm}>
              <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Name (e.g. Mom)" placeholderTextColor={colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary }]} onPress={addContact}>
                  <Text style={[styles.smallBtnText, { color: "#FFFFFF" }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => setAdding(false)}>
                  <Text style={styles.smallBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            contacts.length < 3 && (
              <TouchableOpacity style={[styles.row, contacts.length > 0 && styles.rowDivider]} onPress={() => setAdding(true)}>
                <View style={[styles.rowIcon, { backgroundColor: colors.background }]}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.rowTitle, { color: colors.primary }]}>Add a contact</Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <Text style={styles.footnote}>
          Use SOS only for real emergencies. False alarms reach the warden and doctor too.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 18, paddingBottom: spacing.xl * 2 },

  lead: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, color: colors.textPrimary, textAlign: "center", marginTop: 4 },
  leadSub: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, textAlign: "center", marginTop: 4, lineHeight: 20 },
  types: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  type: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: RED_BG,
  },
  typeOn: { backgroundColor: RED },
  typeText: { fontSize: 13, fontWeight: "800", color: RED_DARK },

  btnWrap: { alignItems: "center", justifyContent: "center", height: 260, marginTop: 6 },
  pulseRing: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: RED },
  sosBtn: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sosFill: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: RED_DARK },
  sosText: { color: "#FFFFFF", fontSize: 46, fontWeight: "900", letterSpacing: 2 },
  sosHint: { color: "#FECACA", fontSize: 13, fontWeight: "800", marginTop: 2, letterSpacing: 1 },
  note: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  activeCard: { backgroundColor: RED, borderRadius: 26, padding: 18, gap: 8 },
  activeTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF" },
  activeKicker: { color: "#FECACA", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  activeTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.4, lineHeight: 27 },
  activeSub: { color: "#FEE2E2", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  activeBtns: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  whiteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  whiteBtnText: { color: RED_DARK, fontWeight: "800", fontSize: 14 },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ghostBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  groupTitle: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  rowSub: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 1 },
  rowPhone: { fontSize: 14, fontWeight: "800", color: RED },
  empty: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, padding: 12, lineHeight: 19 },
  addForm: { padding: 12, gap: 8 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  smallBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 14, backgroundColor: colors.background },
  smallBtnText: { fontWeight: "800", fontSize: 14, color: colors.textPrimary },
  footnote: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textAlign: "center", marginTop: 18 },
});
