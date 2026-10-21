import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, Alert, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, isDark } from "../../theme/theme";
import { ALLOWED_EMAIL_DOMAIN } from "../../context/AuthContext";

// Shared pieces of the sign-in screens (UI canvas: "Login · light" and
// "Wrong account").

// Calm, light header: the app icon, a title and one line under it.
export function AuthHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.hero}>
      <Image source={require("../../../assets/icon.png")} style={styles.heroIcon} accessibilityIgnoresInvertColors />
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSub}>{subtitle}</Text>
    </View>
  );
}

// What the app does, floating over the bottom edge of the hero.
export function FeatureStrip() {
  const items: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: "time-outline", label: "Next class" },
    { icon: "qr-code-outline", label: "Thali Pass" },
    { icon: "business-outline", label: "Empty classes" },
    { icon: "book-outline", label: "Notes & PYQs" },
  ];
  return (
    <View style={styles.strip}>
      {items.map((it) => (
        <View key={it.label} style={styles.stripItem}>
          <View style={styles.stripIcon}>
            <Ionicons name={it.icon} size={18} color={colors.primary} />
          </View>
          <Text style={styles.stripLabel} numberOfLines={1}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GoogleButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity
      style={styles.googleBtn}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {loading ? (
        <ActivityIndicator color={googleFg} />
      ) : (
        <>
          <View style={styles.googleIconWrap}>
            <Ionicons name="logo-google" size={14} color={googleBg} />
          </View>
          <Text style={styles.googleText}>Continue with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// AuthContext's wrong-domain message starts with the rejected address:
// "someone@gmail.com isn't an institute account. Please sign in with …"
export function wrongAccountEmail(message: string | null | undefined): string | null {
  if (!message || !/isn't an institute account/i.test(message)) return null;
  const email = message.split(" isn't an institute account")[0].trim();
  return email || "That account";
}

export function WrongAccountSheet({
  email,
  onRetry,
  onClose,
}: {
  email: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!email} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <View style={styles.alertIcon}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
        </View>
        <Text style={styles.sheetTitle}>That's a personal account</Text>
        <Text style={styles.sheetBody}>
          Only IIIT Surat accounts can use the app. Sign in with the Google account that ends in{" "}
          <Text style={{ fontWeight: "800", color: colors.textPrimary }}>{ALLOWED_EMAIL_DOMAIN}</Text>.
        </Text>
        <View style={styles.rejectedRow}>
          <View style={styles.rejectedAvatar}>
            <Text style={styles.rejectedAvatarText}>{(email ?? "?").charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.rejectedEmail} numberOfLines={1}>
            {email}
          </Text>
          <View style={styles.notAllowed}>
            <Text style={styles.notAllowedText}>NOT ALLOWED</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Choose another account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ alignSelf: "center", padding: 10 }}
          onPress={() =>
            Alert.alert(
              "No institute account?",
              `Every student and faculty member gets a ${ALLOWED_EMAIL_DOMAIN} Google account from the college. If you don't have yours yet, ask the IT team or the academic office.`,
            )
          }
        >
          <Text style={styles.link}>I don't have an institute account</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// The Google button is the dark "ink" colour in light mode and the lime
// accent in dark mode, so it's always the most prominent thing on screen.
const googleBg = isDark ? colors.primary : colors.ink;
const googleFg = isDark ? colors.onPrimary : colors.onInk;

export const authStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  form: { paddingHorizontal: 24, gap: 14 },
  h1: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.textPrimary },
  sub: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
  },
  input: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "600", color: colors.textPrimary, paddingVertical: 0 },
  suffix: { fontSize: 14, fontWeight: "700", color: colors.textSecondary, paddingRight: 8 },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  link: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  footnote: { textAlign: "center", fontSize: 13, fontWeight: "500", color: colors.textSecondary, lineHeight: 19 },
});

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: 28, paddingTop: 36, gap: 10 },
  heroIcon: { width: 76, height: 76, borderRadius: 22, marginBottom: 8 },
  heroTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: -0.6, textAlign: "center" },
  heroSub: { color: colors.textSecondary, fontSize: 15, fontWeight: "500", lineHeight: 21, textAlign: "center" },

  strip: {
    marginHorizontal: 24,
    marginTop: -40,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    shadowColor: "#0E1A33",
    shadowOpacity: isDark ? 0 : 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: isDark ? 0 : 4,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border,
  },
  stripItem: { flex: 1, alignItems: "center", gap: 6 },
  stripIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.badge.blue.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  stripLabel: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },

  googleBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: googleBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: googleFg,
    alignItems: "center",
    justifyContent: "center",
  },
  googleText: { color: googleFg, fontSize: 15, fontWeight: "800" },

  overlay: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 16,
  },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
  alertIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.textPrimary },
  sheetBody: { fontSize: 15, lineHeight: 22, fontWeight: "500", color: colors.textSecondary },
  rejectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rejectedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectedAvatarText: { fontWeight: "800", color: colors.textSecondary },
  rejectedEmail: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.textSecondary,
    textDecorationLine: "line-through",
  },
  notAllowed: { backgroundColor: colors.dangerBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  notAllowedText: { fontSize: 11, fontWeight: "800", color: colors.danger },
  primaryBtn: authStyles.primaryBtn,
  primaryBtnText: authStyles.primaryBtnText,
  link: authStyles.link,

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 14,
    padding: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.danger, lineHeight: 18 },
});
