import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme/theme";
import { useAuth, isAllowedEmailDomain, isReviewerEmail, ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";
import {
  AuthHero,
  FeatureStrip,
  GoogleButton,
  WrongAccountSheet,
  ErrorBox,
  wrongAccountEmail,
  authStyles as s,
} from "./authUi";

type Props = {
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword: () => void;
};

function friendlyError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect ID or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a bit.";
    case "auth/network-request-failed":
      return "No internet connection right now — check your connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// The ID box takes just the part before the @ — the institute domain is
// fixed beside it, so a personal Gmail can't be typed by mistake. Pasting
// a full address still works (an institute one is accepted as-is).
function toEmail(id: string): string {
  const t = id.trim().toLowerCase();
  return t.includes("@") ? t : `${t}${ALLOWED_EMAIL_DOMAIN}`;
}

export default function LoginScreen({ onNavigateToSignUp, onNavigateToForgotPassword }: Props) {
  const { logIn, signInWithGoogle, authError, clearAuthError } = useAuth();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSheet, setDismissedSheet] = useState<string | null>(null);

  const message = error ?? authError;
  const rejected = wrongAccountEmail(message);
  const sheetEmail = rejected && rejected !== dismissedSheet ? rejected : null;

  const handleLogin = async () => {
    setError(null);
    clearAuthError();
    if (!id.trim() || !password) {
      setError("Enter your institute ID and password.");
      return;
    }
    const email = toEmail(id);
    if (!isAllowedEmailDomain(email) && !isReviewerEmail(email)) {
      setError(`Please use your institute account (${ALLOWED_EMAIL_DOMAIN}).`);
      return;
    }
    setLoading(true);
    try {
      await logIn(email, password);
    } catch (e: any) {
      if (__DEV__) console.log("LOGIN ERROR:", e?.code, e?.message);
      setError(friendlyError(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    clearAuthError();
    setDismissedSheet(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (__DEV__) console.log("GOOGLE SIGN-IN ERROR:", e?.code, e?.message);
      setError(e?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={s.page}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.heroBg }} />
          <AuthHero title={"Your campus,\nin your pocket."} subtitle="Timetable, mess, notices, resources — one app." />
          <FeatureStrip />

          <View style={[s.form, { marginTop: 28 }]}>
            <View>
              <Text style={s.h1}>Welcome back</Text>
              <Text style={s.sub}>Sign in with your institute account</Text>
            </View>

            {message && !rejected && <ErrorBox message={message} />}

            <GoogleButton onPress={handleGoogleSignIn} loading={googleLoading} />

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or use email</Text>
              <View style={s.dividerLine} />
            </View>

            <View>
              <Text style={s.label}>Institute ID</Text>
              <View style={s.field}>
                <TextInput
                  style={s.input}
                  placeholder="ug25cse114"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  value={id}
                  onChangeText={setId}
                  accessibilityLabel="Institute ID"
                />
                {!id.includes("@") && <Text style={s.suffix}>{ALLOWED_EMAIL_DOMAIN}</Text>}
              </View>
            </View>

            <View>
              <Text style={s.label}>Password</Text>
              <View style={s.field}>
                <TextInput
                  style={s.input}
                  placeholder="Your password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={onNavigateToForgotPassword} style={{ alignSelf: "flex-end", marginTop: -4, padding: 4 }}>
              <Text style={s.link}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.primaryBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={s.primaryBtnText}>Log in</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToSignUp} style={{ paddingVertical: 4 }}>
              <Text style={s.footnote}>
                First time? Just tap <Text style={{ fontWeight: "800", color: colors.textPrimary }}>Continue with Google</Text> —
                your account is set up automatically.
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
