import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { NATIONAL_HELPLINES, CAMPUS_CONTACT, EXTERNAL_SUPPORT, CrisisResource } from "../data/crisisResources";
import {
  CONCERN_CATEGORIES,
  ConcernCategory,
  CounsellingRequest,
  submitCounsellingRequest,
  subscribeToMyCounsellingRequests,
} from "../firebase/counsellingService";

function callNumber(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() =>
    Alert.alert("Couldn't start the call", "Dial the number directly instead."),
  );
}

function HelplineRow({ resource }: { resource: CrisisResource }) {
  return (
    <TouchableOpacity style={styles.helplineRow} onPress={() => callNumber(resource.phone)}>
      <View style={styles.helplineIconWrap}>
        <Ionicons name="call" size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.helplineName}>{resource.name}</Text>
        <Text style={styles.helplineDesc}>{resource.description}</Text>
      </View>
      <Text style={styles.helplinePhone}>{resource.phone}</Text>
    </TouchableOpacity>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting to be reviewed",
  contacted: "Someone has reached out",
  closed: "Closed",
};

export default function CounsellingScreen() {
  const { profile } = useAuth();
  const [concern, setConcern] = useState<ConcernCategory>("Academic stress");
  const [message, setMessage] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [myRequests, setMyRequests] = useState<CounsellingRequest[]>([]);
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeToMyCounsellingRequests(profile.uid, setMyRequests);
    return () => unsubscribe();
  }, [profile?.uid]);

  const handleSubmit = async () => {
    if (!profile) return;
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert("Add a message", "Write a little about what's going on — even a few lines is enough.");
      return;
    }
    setSubmitting(true);
    try {
      await submitCounsellingRequest({
        studentUid: profile.uid,
        studentName: profile.name,
        studentEnrollmentNumber: profile.enrollmentNumber,
        studentEmail: profile.email,
        concern,
        message: trimmed,
        urgent,
      });
      setMessage("");
      setUrgent(false);
      Alert.alert("Sent", "Only the counselling team can see this. They'll reach out as soon as they can.");
    } catch (err: any) {
      Alert.alert("Couldn't send", err.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.header}>Counselling & Wellness</Text>

          {/* Always here, never behind the form below — this is the one
              part of the screen that has to work even if someone never
              scrolls further or never fills in a single field. */}
          <View style={styles.crisisCard}>
            <Text style={styles.crisisTitle}>If you're in immediate danger, call now</Text>
            <Text style={styles.crisisSubtitle}>
              The form below is checked periodically, not monitored in real time — for anything urgent, call
              instead of waiting for a reply here.
            </Text>
            <HelplineRow resource={CAMPUS_CONTACT} />
            {NATIONAL_HELPLINES.map((h) => (
              <HelplineRow key={h.name} resource={h} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Other ways to get support</Text>
          <Text style={styles.sectionSubtitle}>
            Independent platforms some students on campus already use — separate from IIIT Surat, open to anyone.
          </Text>
          {EXTERNAL_SUPPORT.map((r) => (
            <TouchableOpacity
              key={r.name}
              style={styles.linkRow}
              onPress={() => Linking.openURL(r.url).catch(() => Alert.alert("Couldn't open this", "Try again in a moment."))}
            >
              <View style={styles.linkIconWrap}>
                <Ionicons name="open-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.helplineName}>{r.name}</Text>
                <Text style={styles.helplineDesc}>{r.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>Talk to someone privately</Text>
          <Text style={styles.sectionSubtitle}>
            Only the counselling team sees this — not other faculty, not the general complaints team, not other
            students.
          </Text>

          <Text style={styles.label}>What's this mostly about?</Text>
          <View style={styles.chipRow}>
            {CONCERN_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, concern === c && styles.chipActive]}
                onPress={() => setConcern(c)}
              >
                <Text style={[styles.chipText, concern === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>What's going on?</Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Whatever feels relevant — as much or as little as you want to share"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={5}
          />

          <TouchableOpacity style={styles.urgentRow} onPress={() => setUrgent((v) => !v)}>
            <Ionicons
              name={urgent ? "checkbox" : "square-outline"}
              size={22}
              color={urgent ? colors.danger : colors.textSecondary}
            />
            <Text style={styles.urgentText}>I'd like to talk to someone as soon as possible</Text>
          </TouchableOpacity>
          {urgent && (
            <Text style={styles.urgentHint}>
              This flags your message for the counselling team to prioritize — it still isn't instant. If you need
              help right now, please use one of the numbers above instead.
            </Text>
          )}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitButtonText}>Send privately</Text>}
          </TouchableOpacity>

          {myRequests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Your messages</Text>
              {myRequests.map((r) => (
                <View key={r.id} style={styles.historyCard}>
                  <View style={styles.historyHeaderRow}>
                    <Text style={styles.historyConcern}>{r.concern}</Text>
                    <Text style={styles.historyStatus}>{STATUS_LABEL[r.status]}</Text>
                  </View>
                  <Text style={styles.historyMessage} numberOfLines={2}>{r.message}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  crisisCard: {
    backgroundColor: "#fff5f5",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#f8b4b4",
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  crisisTitle: { ...typography.h3, color: "#9b1c1c" },
  crisisSubtitle: { ...typography.caption, color: "#9b1c1c", marginTop: spacing.xs, marginBottom: spacing.md },
  helplineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  helplineIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: "#c0392b",
    alignItems: "center",
    justifyContent: "center",
  },
  helplineName: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  helplineDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  helplinePhone: { ...typography.caption, fontWeight: "700", color: "#c0392b" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  linkIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.badge.blue.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.xs },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, marginBottom: spacing.xs, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.surface },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 110,
    textAlignVertical: "top",
    color: colors.textPrimary,
    ...typography.body,
  },
  urgentRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  urgentText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  urgentHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: "italic" },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  submitButtonText: { ...typography.body, color: colors.surface, fontWeight: "700" },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  historyConcern: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  historyStatus: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  historyMessage: { ...typography.caption, color: colors.textSecondary },
});
