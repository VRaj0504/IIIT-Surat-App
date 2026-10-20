import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme/theme";
import { useAuth, ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";
import { AuthHero, GoogleButton, WrongAccountSheet, ErrorBox, wrongAccountEmail, authStyles as s } from "./authUi";

type Props = {
  onNavigateToLogin: () => void;
};

// Sign-up IS "Continue with Google" — the account is created on first
// sign-in, then CompleteProfileScreen matches it to the roster/allowlist.
// This screen just explains that, with the same button as Login.
export default function SignUpScreen({ onNavigateToLogin }: Props) {
  const { signInWithGoogle, authError, clearAuthError } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSheet, setDismissedSheet] = useState<string | null>(null);

  const message = error ?? authError;
  const rejected = wrongAccountEmail(message);
  const sheetEmail = rejected && rejected !== dismissedSheet ? rejected : null;

  const handleGoogleSignIn = async () => {
    setError(null);
    clearAuthError();
    setDismissedSheet(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const steps = [
    `Continue with your ${ALLOWED_EMAIL_DOMAIN} Google account`,
    "Tell us if you're a student or faculty",
    "We match you with the college records — your timetable appears automatically",
  ];

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.heroBg }} />
        <AuthHero title={"Welcome to\nIIIT Surat."} subtitle="Set up your account in under a minute." />

        <View style={[s.form, { marginTop: -36 }]}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 22,
              padding: 18,
              gap: 14,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {steps.map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.badge.blue.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontWeight: "800", fontSize: 13, color: colors.badge.blue.fg }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, lineHeight: 20 }}>
                  {step}
                </Text>
              </View>
            ))}
          </View>

          {message && !rejected && <ErrorBox message={message} />}

          <GoogleButton onPress={handleGoogleSignIn} loading={googleLoading} />

          <TouchableOpacity onPress={onNavigateToLogin} style={{ paddingVertical: 6 }}>
            <Text style={s.footnote}>
              Already set up? <Text style={s.link}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <WrongAccountSheet
        email={sheetEmail}
        onClose={() => setDismissedSheet(rejected)}
        onRetry={() => {
          setDismissedSheet(rejected);
          handleGoogleSignIn();
        }}
      />
    </View>
  );
}
