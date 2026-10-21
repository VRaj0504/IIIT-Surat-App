import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/firestore";
import { colors } from "../../theme/theme";
import { useAuth, Role } from "../../context/AuthContext";
import { ErrorBox, authStyles as s } from "./authUi";
import { KeyboardAwareScrollView } from "../../components/KeyboardAware";

type RosterMatch =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "found"; branch: string; section: string; admissionYear: number }
  | { state: "missing" }
  | { state: "error" };

// Enrollment numbers look like UG25CSE114 — check the roster once enough
// has been typed for a real number, so the student SEES which branch /
// section / batch they'll be filed under before they commit, instead of
// finding out from a wrong timetable later.
function looksComplete(n: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z]{2,4}\d{2,4}$/.test(n);
}

export default function CompleteProfileScreen() {
  const { user, completeGoogleProfile, logOut } = useAuth();
  // Student institute emails are the enrollment number (ug25cse114@…), so
  // pre-pick Student and fill it in; anything else (name.surname@…) starts
  // on Faculty. Both are still checked against the roster / faculty list.
  const emailLocal = (user?.email ?? "").split("@")[0].toUpperCase();
  const emailIsRegNo = /^(UG|PG|RS|PH)\d{2}[A-Z]{2,4}\d{2,4}$/.test(emailLocal);
  const [role, setRole] = useState<Role>(emailIsRegNo || !user?.email ? "student" : "faculty");
  const [enrollmentNumber, setEnrollmentNumber] = useState(emailIsRegNo ? emailLocal : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<RosterMatch>({ state: "idle" });

  const regNo = enrollmentNumber.trim().toUpperCase();

  useEffect(() => {
    if (role !== "student" || !looksComplete(regNo)) {
      setMatch({ state: "idle" });
      return;
    }
    let cancelled = false;
    setMatch({ state: "checking" });
    const t = setTimeout(() => {
      getDoc(doc(db, "roster", regNo))
        .then((snap) => {
          if (cancelled) return;
          if (!snap.exists()) return setMatch({ state: "missing" });
          const d = snap.data() as { branch?: string; section?: string; admissionYear?: number };
          setMatch({ state: "found", branch: d.branch ?? "—", section: d.section ?? "—", admissionYear: d.admissionYear ?? 0 });
        })
        .catch(() => !cancelled && setMatch({ state: "error" }));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [regNo, role]);

  const handleContinue = async () => {
    setError(null);
    if (role === "student" && !regNo) {
      setError("Enrollment number is required for students.");
      return;
    }
    setLoading(true);
    try {
      await completeGoogleProfile({ role, enrollmentNumber: role === "student" ? regNo : undefined });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const name = user?.displayName ?? "Your account";
  const initials = name
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  const fieldBorder =
    match.state === "found" ? colors.success : match.state === "missing" ? colors.danger : colors.border;

  return (
    <View style={s.page}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView behavior={undefined} style={{ flex: 1 }}>
          <KeyboardAwareScrollView contentContainerStyle={[s.form, { paddingTop: 16, paddingBottom: 40, gap: 18 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.topRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={styles.stepOn} />
                <View style={styles.stepOn} />
                <Text style={styles.stepText}>Step 2 of 2</Text>
              </View>
              <TouchableOpacity onPress={() => logOut()} style={{ padding: 8 }}>
                <Text style={s.link}>Sign out</Text>
              </TouchableOpacity>
            </View>

            <View>
              <Text style={[s.h1, { fontSize: 26 }]}>Let's set up your profile</Text>
              <Text style={[s.sub, { lineHeight: 20 }]}>
                We match you with the college records, so your timetable and classes appear automatically.
              </Text>
            </View>

            <View style={styles.accountCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials || "?"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
              {user?.emailVerified && (
                <View style={styles.verified}>
                  <Text style={styles.verifiedText}>VERIFIED</Text>
                </View>
              )}
            </View>

            {error && <ErrorBox message={error} />}

            <View>
              <Text style={s.label}>I am a</Text>
              <View style={styles.segment}>
                {(["student", "faculty"] as Role[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.segmentBtn, role === r && styles.segmentBtnActive]}
                    onPress={() => setRole(r)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: role === r }}
                  >
                    <Text style={[styles.segmentText, role === r && styles.segmentTextActive]}>
                      {r === "student" ? "Student" : "Faculty"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {role === "student" ? (
              <>
                <View>
                  <Text style={s.label}>Enrollment number</Text>
                  <View style={[s.field, { borderColor: fieldBorder, borderWidth: 2, height: 54 }]}>
                    <TextInput
                      style={[s.input, { fontSize: 16, fontWeight: "800", letterSpacing: 1 }]}
                      placeholder="UG25CSE114"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      value={enrollmentNumber}
                      onChangeText={setEnrollmentNumber}
                      accessibilityLabel="Enrollment number"
                    />
                    <View style={{ width: 40, alignItems: "center" }}>
                      {match.state === "checking" ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : match.state === "found" ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                      ) : match.state === "missing" ? (
                        <Ionicons name="close-circle" size={22} color={colors.danger} />
                      ) : null}
                    </View>
                  </View>
                </View>

                {match.state === "found" && (
                  <View style={styles.matchCard}>
                    <Text style={styles.matchTitle}>Found you on the roster</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        ["Branch", match.branch],
                        ["Section", match.section],
                        ["Batch", match.admissionYear ? String(match.admissionYear) : "—"],
                      ].map(([k, v]) => (
                        <View key={k} style={styles.matchCell}>
                          <Text style={styles.matchKey}>{k}</Text>
                          <Text style={styles.matchVal}>{v}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.matchNote}>Something wrong? Contact the academic office before continuing.</Text>
                  </View>
                )}
                {match.state === "missing" && (
                  <ErrorBox message="This enrollment number isn't on the student roster. Check it, or contact the academic office." />
                )}
              </>
            ) : (
              <Text style={[s.sub, { lineHeight: 20 }]}>
                Faculty accounts are checked against the official faculty list for {user?.email}.
              </Text>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, (loading || match.state === "missing") && { opacity: 0.6 }]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={s.primaryBtnText}>Continue to the app</Text>}
            </TouchableOpacity>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepOn: { width: 28, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  stepText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginLeft: 6 },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onPrimary, fontWeight: "800", fontSize: 15 },
  accountName: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  accountEmail: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  verified: { backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  verifiedText: { fontSize: 11, fontWeight: "800", color: colors.successFg },
  segment: { flexDirection: "row", gap: 6, backgroundColor: colors.surfaceAlt, padding: 5, borderRadius: 16 },
  segmentBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  segmentTextActive: { color: colors.textPrimary, fontWeight: "800" },
  matchCard: {
    backgroundColor: colors.successBg,
    borderWidth: 1.5,
    borderColor: colors.successBorder,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  matchTitle: { fontSize: 14, fontWeight: "800", color: colors.successFg },
  matchCell: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 10, gap: 2 },
  matchKey: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  matchVal: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  matchNote: { fontSize: 12, fontWeight: "600", color: colors.successFg },
});
