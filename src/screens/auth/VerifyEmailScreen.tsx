import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, AppState } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { ErrorBox } from "./authUi";
import { GlassScreen, Glass, Reveal, Heading, PrimaryButton, g, TEXT, MUTED, ACCENT } from "./glassUi";

const RESEND_SECONDS = 60;

// Shown after "Create account" with email: the person opens the link we sent
// to their institute inbox, then comes back. Checked automatically whenever
// the app returns to the foreground, and by the button.
export default function VerifyEmailScreen() {
  const { user, checkEmailVerified, resendVerificationEmail, logOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkEmailVerified().catch(() => {});
    });
    return () => sub.remove();
  }, [checkEmailVerified]);

  const check = async () => {
    setError(null);
    setInfo(null);
    setChecking(true);
    try {
      const ok = await checkEmailVerified();
      if (!ok) setError("Not verified yet. Open the link in the email first, then tap this again.");
    } catch {
      setError("Couldn't check right now — check your internet and try again.");
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await resendVerificationEmail();
      setInfo("Sent again. It can take a minute to arrive.");
      setWait(RESEND_SECONDS);
    } catch (e: any) {
      setError(e?.code === "auth/too-many-requests" ? "Too many emails sent. Wait a few minutes and try again." : "Couldn't send the email. Try again.");
    }
  };

  return (
    <GlassScreen>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={g.scroll} showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, minHeight: 36 }} />

          <Reveal delay={100}>
            <Heading icon="mail-unread-outline" title={"Verify your\nemail"} subtitle="One last step to confirm it's really you." />
          </Reveal>

          {error && (
            <Animated.View entering={FadeIn.duration(300)}>
              <ErrorBox message={error} />
            </Animated.View>
          )}

          <Reveal delay={250}>
            <Glass style={g.panel}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <Ionicons name="paper-plane-outline" size={22} color={TEXT} />
                <Text style={{ flex: 1, fontSize: 14.5, color: TEXT, lineHeight: 21 }}>
                  We sent a link to <Text style={{ fontWeight: "800" }}>{user?.email}</Text>. Open it, then come back here. Check
                  Spam if you don't see it.
                </Text>
              </View>
              {info ? <Text style={{ fontSize: 13, color: MUTED }}>{info}</Text> : null}
              <PrimaryButton label="I've verified" icon="checkmark" onPress={check} loading={checking} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 }}>
                <TouchableOpacity onPress={resend} disabled={wait > 0}>
                  <Text style={[g.link, wait > 0 && { color: MUTED }]}>{wait > 0 ? `Resend in ${wait}s` : "Resend email"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => logOut()}>
                  <Text style={[g.link, { color: ACCENT }]}>Use another account</Text>
                </TouchableOpacity>
              </View>
            </Glass>
          </Reveal>
        </ScrollView>
      </SafeAreaView>
    </GlassScreen>
  );
}
