import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, KeyboardAvoidingView, ScrollView } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";
import { WrongAccountSheet, ErrorBox, wrongAccountEmail } from "./authUi";
import { toInstituteEmail } from "./LoginScreen";
import { GlassScreen, Glass, Reveal, Heading, HintRow, OptionCard, GlassInput, PrimaryButton, RoundBack, Footer, g, ACCENT, MUTED, TEXT, EASE } from "./glassUi";

type Props = { onNavigateToLogin: () => void };

function friendlyError(e: any): string {
  switch (e?.code) {
    case "auth/email-already-in-use":
      return "This email already has an account. Log in instead, or use Google.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/network-request-failed":
      return "No internet connection right now — check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-up isn't switched on yet. Use Google for now.";
    default:
      return e?.message?.replace(/^Firebase: /, "") || "Something went wrong. Please try again.";
  }
}

export default function SignUpScreen({ onNavigateToLogin }: Props) {
  const { signInWithGoogle, signUpWithEmail, authError, clearAuthError } = useAuth();
  const [emailOpen, setEmailOpen] = useState(false);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedSheet, setDismissedSheet] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const idRef = useRef<any>(null);
  const pwRef = useRef<any>(null);
  const cfRef = useRef<any>(null);

  const message = error ?? authError;
  const rejected = wrongAccountEmail(message);
  const sheetEmail = rejected && rejected !== dismissedSheet ? rejected : null;
  const keepVisible = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 280);

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

  const handleCreate = async () => {
    setError(null);
    clearAuthError();
    if (name.trim().length < 3) return setError("Enter your full name.");
    if (!id.trim()) return setError("Enter your institute ID.");
    const email = toInstituteEmail(id);
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) return setError(`Use your institute email (${ALLOWED_EMAIL_DOMAIN}).`);
    if (password.length < 8) return setError("Use at least 8 characters for the password.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      await signUpWithEmail({ name, email, password });
    } catch (e: any) {
      setError(friendlyError(e));
      setLoading(false);
    }
  };

  const eye = (
    <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={10}>
      <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={19} color={MUTED} />
    </TouchableOpacity>
  );

  return (
    <GlassScreen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={g.scroll} showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, minHeight: 36 }} />

            <Reveal delay={80} style={{ gap: 18 }}>
              <Heading icon="person-add-outline" title="Create account" subtitle="For IIIT Surat students and faculty. Takes under a minute." />
              <HintRow text="Got an account?" link="Log in here" onPress={onNavigateToLogin} />
            </Reveal>

            {message && !rejected && (
              <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
                <ErrorBox message={message} />
              </Animated.View>
            )}

            <Reveal delay={220} style={g.options}>
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
                      placeholder="Full name"
                      autoCapitalize="words"
                      textContentType="name"
                      returnKeyType="next"
                      value={name}
                      onChangeText={setName}
                      onFocus={keepVisible}
                      onSubmitEditing={() => idRef.current?.focus()}
                    />
                    <GlassInput
                      ref={idRef}
                      icon="at-outline"
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
                      placeholder="Password (8+ characters)"
                      secureTextEntry={!showPw}
                      textContentType="newPassword"
                      returnKeyType="next"
                      value={password}
                      onChangeText={setPassword}
                      onFocus={keepVisible}
                      onSubmitEditing={() => cfRef.current?.focus()}
                      right={eye}
                    />
                    <GlassInput
                      ref={cfRef}
                      icon="shield-checkmark-outline"
                      placeholder="Confirm password"
                      secureTextEntry={!showPw}
                      textContentType="newPassword"
                      returnKeyType="go"
                      value={confirm}
                      onChangeText={setConfirm}
                      onFocus={keepVisible}
                      onSubmitEditing={handleCreate}
                    />
                    <PrimaryButton label="Create account" onPress={handleCreate} loading={loading} />
                    <Text style={g.note}>We'll send a confirmation link to your institute inbox.</Text>
                  </Glass>
                </Animated.View>
              ) : null}
            </Animated.View>

            <Reveal delay={360} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <RoundBack onPress={onNavigateToLogin} />
              <View style={{ flex: 1, alignItems: "flex-start" }}>
                <Footer
                  text={
                    <>
                      Only <Text style={{ fontWeight: "700", color: TEXT }}>{ALLOWED_EMAIL_DOMAIN}</Text> accounts
                    </>
                  }
                />
              </View>
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
