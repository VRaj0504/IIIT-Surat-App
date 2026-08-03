import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../../theme/theme";
import { useAuth, Role } from "../../context/AuthContext";

// Shown right after a first-time Google sign-in. The Google account already
// gives us name + verified institute email, so all we still need is the
// same information email/password signup collects: role, and (for
// students) enrollment number — both required to pass the allowlist/roster
// gate in firestore.rules.
export default function CompleteProfileScreen() {
  const { user, completeGoogleProfile, logOut } = useAuth();
  const [role, setRole] = useState<Role>("student");
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    if (role === "student" && !enrollmentNumber.trim()) {
      setError("Enrollment number is required for students.");
      return;
    }
    setLoading(true);
    try {
      await completeGoogleProfile({
        role,
        enrollmentNumber:
          role === "student" ? enrollmentNumber.trim() : undefined,
      });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.brand}>IIIT Surat</Text>
            <Text style={styles.title}>One more step</Text>
            <Text style={styles.subtitle}>
              Signed in as {user?.email}. Tell us who you are to finish setting
              up your account.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.roleToggle}>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  role === "student" && styles.roleBtnActive,
                ]}
                onPress={() => setRole("student")}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    role === "student" && styles.roleBtnTextActive,
                  ]}
                >
                  Student
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  role === "faculty" && styles.roleBtnActive,
                ]}
                onPress={() => setRole("faculty")}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    role === "faculty" && styles.roleBtnTextActive,
                  ]}
                >
                  Faculty
                </Text>
              </TouchableOpacity>
            </View>

            {role === "student" && (
              <>
                <Text style={styles.label}>Enrollment Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="UG25CSE114"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                  value={enrollmentNumber}
                  onChangeText={setEnrollmentNumber}
                />
              </>
            )}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => logOut()} style={styles.linkBtn}>
              <Text style={styles.linkText}>
                Wrong account? <Text style={styles.linkTextBold}>Sign out</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  brand: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.danger,
    backgroundColor: "#FCEAEB",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    ...typography.caption,
  },
  roleToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...clayShadowSoft,
    padding: 4,
    marginBottom: spacing.sm,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  roleBtnActive: { backgroundColor: colors.primary },
  roleBtnText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  roleBtnTextActive: { color: "#fff" },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  linkBtn: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkTextBold: { color: colors.primary, fontWeight: "700" },
});
