import React, { useRef, useState } from "react";
import { View, Text, KeyboardAvoidingView, ScrollView } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, isAllowedEmailDomain, isReviewerEmail, ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";
import { ErrorBox } from "./authUi";
import { toInstituteEmail } from "./LoginScreen";
import { GlassScreen, Glass, Reveal, Heading, HintRow, GlassInput, PrimaryButton, RoundBack, g, TEXT, MUTED, EASE, AuthSpacer, useAuthScroll } from "./glassUi";

type Props = { onNavigateToLogin: () => void };

export default function ForgotPasswordScreen({ onNavigateToLogin }: Props) {
  const authScroll = useAuthScroll();
  const { sendPasswordReset } = useAuth();
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const keepVisible = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 280);

  const send = async () => {
    setError(null);
    if (!id.trim()) return setError("Enter your institute ID.");
    const email = toInstituteEmail(id);
    if (!isAllowedEmailDomain(email) && !isReviewerEmail(email)) {
      return setError(`Use your institute account (${ALLOWED_EMAIL_DOMAIN}).`);
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);

      setSentTo(email);
    } catch (e: any) {
      setError(
        e?.code === "auth/network-request-failed"
          ? "No internet connection right now — try again."
          : e?.code === "auth/too-many-requests"
            ? "A reset email was sent recently. Check your inbox (and spam), or try again in a few minutes."
            : e?.code === "auth/user-not-found"
              ? "There's no account with this ID yet. Create one first."
              : "Couldn't send the email. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassScreen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" alwaysBounceVertical overScrollMode="always" contentContainerStyle={authScroll} showsVerticalScrollIndicator={false}>
            <AuthSpacer min={36} />

            <Reveal delay={100} style={{ gap: 18 }}>
              <Heading icon="key-outline" title={"Reset\npassword"} subtitle="We'll email a reset link to your institute inbox." />
              <HintRow text="Remembered it?" link="Log in" onPress={onNavigateToLogin} />
            </Reveal>

            {error && (
              <Animated.View entering={FadeIn.duration(300)}>
                <ErrorBox message={error} />
              </Animated.View>
            )}

            <Reveal delay={250}>
              {sentTo ? (
                <Animated.View entering={FadeIn.duration(400).easing(EASE)}>
                  <Glass style={[g.panel, { alignItems: "center", paddingVertical: 24 }]}>
                    <Ionicons name="mail-open-outline" size={36} color={TEXT} />
                    <Text style={{ fontSize: 18, fontWeight: "800", color: TEXT }}>Check your inbox</Text>
                    <Text style={{ fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20 }}>
                      If {sentTo} has a password account, a reset link is on its way. Check Spam too, then log in with the new password.
                    </Text>
                    <View style={{ alignSelf: "stretch", marginTop: 6 }}>
                      <PrimaryButton label="Back to log in" onPress={onNavigateToLogin} />
                    </View>
                  </Glass>
                </Animated.View>
              ) : (
                <Glass style={g.panel}>
                  <GlassInput
                    icon="at-outline"
                    placeholder="Institute ID"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    value={id}
                    onChangeText={setId}
                    onSubmitEditing={send}
                    onFocus={keepVisible}
                    suffix={id.includes("@") ? undefined : ALLOWED_EMAIL_DOMAIN}
                  />
                  <PrimaryButton label="Send reset link" onPress={send} loading={loading} />
                  <Text style={{ fontSize: 12.5, color: MUTED, textAlign: "center", lineHeight: 18 }}>
                    Signed up with Google? You don't have a password — just use Continue with Google.
                  </Text>
                </Glass>
              )}
            </Reveal>

            <Reveal delay={400}>
              <RoundBack onPress={onNavigateToLogin} />
            </Reveal>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
}
