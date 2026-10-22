import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, KeyboardAvoidingView, ScrollView } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, isAllowedEmailDomain, isReviewerEmail, ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";
import { WrongAccountSheet, ErrorBox, wrongAccountEmail } from "./authUi";
import { GlassScreen, Glass, Reveal, BrandRow, Heading, HintRow, OptionCard, GlassInput, PrimaryButton, Footer, g, ACCENT, MUTED, TEXT, EASE } from "./glassUi";

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

export function toInstituteEmail(id: string): string {
  const t = id.trim().toLowerCase();
  return t.includes("@") ? t : `${t}${ALLOWED_EMAIL_DOMAIN}`;
}

export default function LoginScreen({ onNavigateToSignUp, onNavigateToForgotPassword }: Props) {
  const { logIn, signInWithGoogle, authError, clearAuthError } = useAuth();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSheet, setDismissedSheet] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const pwRef = useRef<any>(null);

  const message = error ?? authError;
  const rejected = wrongAccountEmail(message);
  const sheetEmail = rejected && rejected !== dismissedSheet ? rejected : null;

  const keepVisible = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 280);

  const handleLogin = async () => {
    setError(null);
    clearAuthError();
    if (!id.trim() || !password) return setError("Enter your institute ID and password.");
    const email = toInstituteEmail(id);
    if (!isAllowedEmailDomain(email) && !isReviewerEmail(email)) {
      return setError(`Please use your institute account (${ALLOWED_EMAIL_DOMAIN}).`);
    }
    setLoading(true);
    try {
      await logIn(email, password);
    } catch (e: any) {
      setError(friendlyError(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
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

  return (
    <GlassScreen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={g.scroll} showsVerticalScrollIndicator={false}>
            <Reveal>
              <BrandRow />
            </Reveal>

            <View style={{ flex: 1, minHeight: 24 }} />

            <Reveal delay={120} style={{ gap: 18 }}>
              <Heading icon="log-in-outline" title="Sign in" subtitle="Classes, attendance, notices and the mess — everything for your day at IIIT Surat." />
              <HintRow text="New to CollegeGo?" link="Create an account" onPress={onNavigateToSignUp} />
            </Reveal>

            {message && !rejected && (
              <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
                <ErrorBox message={message} />
              </Animated.View>
            )}

            <Reveal delay={260} style={g.options}>
              <OptionCard label="Google" loading={googleLoading} onPress={handleGoogle} icon={<Ionicons name="logo-google" size={24} color="#EA4335" />} />
              <OptionCard
                label="Email"
                selected={emailOpen}
                onPress={() => {
                  setEmailOpen((v) => !v);
                  if (!emailOpen) keepVisible();
                }}
                icon={<Ionicons name="mail" size={22} color={ACCENT} />}
              />
            </Reveal>

            <Animated.View layout={LinearTransition.duration(300).easing(EASE)}>
              {emailOpen ? (
                <Animated.View entering={FadeIn.duration(350).easing(EASE)} exiting={FadeOut.duration(150)}>
                  <Glass style={g.panel}>
                    <GlassInput
                      icon="person-outline"
                      placeholder="Institute ID"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="username"
                      returnKeyType="next"
                      value={id}
                      onChangeText={setId}
                      onFocus={keepVisible}
                      onSubmitEditing={() => pwRef.current?.focus()}
                      suffix={id.includes("@") ? undefined : ALLOWED_EMAIL_DOMAIN}
                    />
                    <GlassInput
                      ref={pwRef}
                      icon="lock-closed-outline"
                      placeholder="Password"
                      secureTextEntry={!showPassword}
                      textContentType="password"
                      returnKeyType="go"
                      value={password}
                      onChangeText={setPassword}
                      onFocus={keepVisible}
                      onSubmitEditing={handleLogin}
                      right={
                        <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                          <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={MUTED} />
                        </TouchableOpacity>
                      }
                    />
                    <TouchableOpacity onPress={onNavigateToForgotPassword} style={{ alignSelf: "flex-end" }} hitSlop={8}>
                      <Text style={g.link}>Forgot password?</Text>
                    </TouchableOpacity>
                    <PrimaryButton label="Log in" onPress={handleLogin} loading={loading} />
                  </Glass>
                </Animated.View>
              ) : null}
            </Animated.View>

            <Reveal delay={400}>
              <Footer
                text={
                  <>
                    Only <Text style={{ fontWeight: "700", color: TEXT }}>{ALLOWED_EMAIL_DOMAIN}</Text> accounts can sign in
                  </>
                }
              />
            </Reveal>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <WrongAccountSheet
        email={sheetEmail}
        onClose={() => setDismissedSheet(rejected)}
        onRetry={() => {
          setDismissedSheet(rejected);
          handleGoogle();
        }}
      />
    </GlassScreen>
  );
}
