import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";

type Props = {
  onNavigateToLogin: () => void;
};

// Email+password account CREATION was removed on purpose (kept only for
// LOGIN, in LoginScreen.tsx, so nobody with an existing account gets
// locked out). Typing an email into a form never proves you control that
// inbox, so a plain signup form let anyone create an account AS someone
// else just by knowing their institute email — which is a predictable
// roll-number@iiitsurat.ac.in, not a secret. Google Sign-In verifies
// inbox ownership during the OAuth flow itself, which a typed-in email
// can't do, and Firebase Auth enforces one account per email permanently
// regardless of any later verification step — so the fix has to happen
// before an account is created, not after. Google Sign-In already routes
// through the same allowlist/roster gating (completeGoogleProfile), for
// both student and faculty roles, so this isn't a reduced-security path.
export default function SignUpScreen({ onNavigateToLogin }: Props) {
  const { signInWithGoogle } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
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
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>IIIT Surat</Text>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Sign up with your institute Google account — student or faculty,
            you'll pick that on the next step.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={18}
                  color={colors.textPrimary}
                />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToLogin} style={styles.linkBtn}>
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkTextBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  googleBtnText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  linkBtn: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkTextBold: { color: colors.primary, fontWeight: "700" },
});
