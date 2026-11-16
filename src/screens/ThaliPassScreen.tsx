import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import QRCode from "react-native-qrcode-svg";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  checkMySubscription,
  getTodaysMealStatus,
  MealSlot,
  MealStatus,
} from "../firebase/messSubscriptionService";

const MEAL_LABELS: Record<MealSlot, string> = {
  lunch: "Lunch",
 
};

const STATUS_STYLE: Record<MealStatus, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  scanned: { icon: "checkmark-circle", color: colors.success, label: "Eaten" },
  missed: { icon: "close-circle", color: colors.danger, label: "Missed" },
  ongoing: { icon: "time-outline", color: colors.warning, label: "Now" },
  upcoming: { icon: "ellipse-outline", color: colors.textSecondary, label: "Upcoming" },
};

const BRANCH_FULL_NAMES: Record<string, string> = {
  CSE: "Computer Science & Engineering",
  ECE: "Electronics & Communication Engineering",
  MNC: "Mathematics & Computing",
};

type PageMode = "card" | "qr";

export default function ThaliPassScreen() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<PageMode>("card");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [validTill, setValidTill] = useState<string | undefined>();
  const [mealStatus, setMealStatus] = useState<Record<MealSlot, MealStatus> | null>(null);

  useEffect(() => {
    if (!profile?.enrollmentNumber) {
      setLoading(false);
      return;
    }
    checkMySubscription(profile.enrollmentNumber)
      .then((subscription) => {
        setActive(subscription.active);
        setValidTill(subscription.validTill);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[ThaliPassScreen] checkMySubscription failed:", err);
      })
      .finally(() => setLoading(false));

    getTodaysMealStatus(profile.enrollmentNumber)
      .then(setMealStatus)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[ThaliPassScreen] getTodaysMealStatus failed:", err);
      });
  }, [profile?.enrollmentNumber]);

  const initial = profile?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView style={{ flex: 1, alignSelf: "stretch" }} contentContainerStyle={{ alignItems: "center", paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingSpinner style={{ marginTop: spacing.xl }} />
        ) : active ? (
          <>
            <View style={styles.switcher}>
              <TouchableOpacity
                style={[styles.switcherBtn, mode === "card" && styles.switcherBtnActive]}
                onPress={() => setMode("card")}
              >
                <Text style={[styles.switcherText, mode === "card" && styles.switcherTextActive]}>ID Card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.switcherBtn, mode === "qr" && styles.switcherBtnActive]}
                onPress={() => setMode("qr")}
              >
                <Text style={[styles.switcherText, mode === "qr" && styles.switcherTextActive]}>QR Code</Text>
              </TouchableOpacity>
            </View>

            {mode === "card" ? (
              <View style={styles.idCard}>
                <View style={styles.idCardBanner}>
                  <Text style={styles.idCardBannerText}>COLLEGEGO</Text>
                  <Text style={styles.idCardBannerSubtext}>Unlimited Thali — Student Pass</Text>
                </View>
                <View style={styles.idCardBody}>
                  {profile?.photoUrl ? (
                    <Image source={{ uri: profile.photoUrl }} style={styles.idPhoto} />
                  ) : (
                    <View style={[styles.idPhoto, styles.idPhotoPlaceholder]}>
                      <Text style={styles.idPhotoInitial}>{initial}</Text>
                    </View>
                  )}
                  <View style={styles.idDetails}>
                    <Text style={styles.idName}>{profile?.name}</Text>
                    <Text style={styles.idClass}>
                      B.TECH | {profile?.branch ? BRANCH_FULL_NAMES[profile.branch] ?? profile.branch : ""}
                    </Text>
                    <View style={styles.idFieldRow}>
                      <View style={styles.idField}>
                        <Text style={styles.idFieldLabel}>Registration No.</Text>
                        <Text style={styles.idFieldValue}>{profile?.enrollmentNumber}</Text>
                      </View>
                      <View style={styles.idField}>
                        <Text style={styles.idFieldLabel}>Batch</Text>
                        <Text style={styles.idFieldValue}>{profile?.admissionYear}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.idCardFooter}>
                  <Text style={styles.idValidText}>Valid till: {validTill ?? "—"}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.qrCard}>
                <Text style={styles.qrName}>{profile?.name}</Text>
                <Text style={styles.qrEnrollment}>{profile?.enrollmentNumber}</Text>
                <View style={styles.qrWrap}>
                  <QRCode value={profile?.enrollmentNumber ?? ""} size={180} color="#0E1A33" backgroundColor="#fff" />
                </View>
                <Text style={styles.qrHelper}>Show this at the canteen door — one scan per meal.</Text>
              </View>
            )}

            <View style={styles.todaySection}>
              <Text style={styles.todayHeader}>Today</Text>
              <View style={styles.mealRow}>
                {mealStatus &&
                  ([ "lunch"] as MealSlot[]).map((slot) => {
                    const status = mealStatus[slot];
                    const style = STATUS_STYLE[status];
                    return (
                      <View key={slot} style={styles.mealPill}>
                        <Ionicons name={style.icon} size={22} color={style.color} />
                        <Text style={styles.mealPillLabel}>{MEAL_LABELS[slot]}</Text>
                        <Text style={[styles.mealPillStatus, { color: style.color }]}>{style.label}</Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyPass}>
              <View style={styles.emptyPassTop}>
                <Text style={styles.emptyPassLabel}>UNLIMITED THALI</Text>
                <Ionicons name="restaurant-outline" size={20} color={colors.heroMuted} />
              </View>
              <View style={styles.emptyQr}>
                <Ionicons name="qr-code-outline" size={56} color={colors.heroMuted} />
              </View>
              <Text style={styles.emptyPassName}>Not active this semester</Text>
            </View>
            <Text style={styles.emptyText}>Your pass appears here once you subscribe</Text>
            <View style={styles.steps}>
              {[
                "Pay for the semester's Unlimited Thali through the college payment link.",
                "The mess office adds you to the subscriber list.",
                "Show this QR at the canteen door. Staff scan it, and you're in.",
              ].map((t, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{t}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.emptySubtext}>Already paid? The list may not be updated yet. Check with the mess office.</Text>
          </View>
        )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  header: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.md },

  switcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    marginTop: spacing.lg,
  },
  switcherBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.full },
  switcherBtnActive: { backgroundColor: colors.primary },
  switcherText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  switcherTextActive: { color: colors.surface },

  idCard: {
    width: "90%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    overflow: "hidden",
    ...clayShadowSoft,
  },
  idCardBanner: { backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  idCardBannerText: { color: colors.surface, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  idCardBannerSubtext: { color: colors.surface, opacity: 0.85, fontSize: 11, marginTop: 2 },
  idCardBody: { flexDirection: "row", padding: spacing.lg, gap: spacing.md },
  idPhoto: { width: 90, height: 110, borderRadius: radius.sm },
  idPhotoPlaceholder: { backgroundColor: colors.primary + "20", justifyContent: "center", alignItems: "center" },
  idPhotoInitial: { fontSize: 32, fontWeight: "800", color: colors.primary },
  idDetails: { flex: 1, justifyContent: "center" },
  idName: { ...typography.h3, color: colors.textPrimary, fontWeight: "800" },
  idClass: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  idFieldRow: { gap: spacing.xs },
  idField: {},
  idFieldLabel: { fontSize: 10, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  idFieldValue: { fontSize: 13, color: colors.textPrimary, fontWeight: "700" },
  idCardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  idValidText: { fontSize: 12, color: colors.success, fontWeight: "700" },

  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    ...clayShadowSoft,
  },
  qrName: { ...typography.h3, color: colors.textPrimary },
  qrEnrollment: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  qrWrap: { padding: spacing.md, backgroundColor: "#fff", borderRadius: radius.md },
  qrHelper: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, textAlign: "center" },

  todaySection: { width: "100%", paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  todayHeader: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  mealRow: { flexDirection: "row", gap: spacing.sm },
  mealPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 4,
    ...clayShadowSoft,
  },
  mealPillLabel: { fontSize: 12, color: colors.textPrimary, fontWeight: "600" },
  mealPillStatus: { fontSize: 11, fontWeight: "700" },

  emptyContainer: { gap: spacing.md, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  emptyPass: { borderRadius: 24, padding: spacing.lg, backgroundColor: colors.primary, opacity: 0.55, alignItems: "center", gap: spacing.md },
  emptyPassTop: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emptyPassLabel: { fontSize: 11.5, fontWeight: "800", letterSpacing: 1.4, color: colors.heroMuted },
  emptyQr: { width: 120, height: 120, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: colors.heroMuted, alignItems: "center", justifyContent: "center" },
  emptyPassName: { fontSize: 16, fontWeight: "800", color: colors.onPrimary },
  emptyText: { ...typography.h3, color: colors.textPrimary, textAlign: "center", marginTop: spacing.sm },
  steps: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  step: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.badge.blue.bg, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 12, fontWeight: "800", color: colors.badge.blue.fg },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  emptySubtext: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
