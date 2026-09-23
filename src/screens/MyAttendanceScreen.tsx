import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, radius, typography } from "../theme/theme";

// The college has moved attendance-marking to NTProxy (QR scan-in), so
// this screen no longer computes its own percentages from
// attendanceSessions — those numbers stopped being marked and would
// just sit there getting staler and more misleading (a 66.7% from
// whenever marking here stopped, forever). NTProxy is the live source
// now. This screen goes back to showing real per-subject/overall
// numbers once a data sync from NTProxy exists — see
// getMyAttendance/SubjectAttendance in attendanceService.ts, kept
// around unused for that.
const NTPROXY_URL = "https://ntproxy.onrender.com";

export default function MyAttendanceScreen() {
  // A slow, gentle breathing pulse on the QR icon — same shared-value
  // pulse technique as LoadingSpinner.tsx, just one dot instead of
  // three, and slower/subtler since this runs the whole time the
  // screen is open, not just during a brief load.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.header}>My Attendance</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(450)}>
          <TouchableOpacity
            style={styles.ntproxyBanner}
            activeOpacity={0.8}
            onPress={() =>
              Linking.openURL(NTPROXY_URL).catch(() =>
                Alert.alert("Couldn't open NTProxy", "Try again in a moment."),
              )
            }
          >
            <Animated.View style={pulseStyle}>
              <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
            </Animated.View>
            <Text style={styles.ntproxyBannerText}>Scan in & check live attendance on NTProxy</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).duration(500)} style={styles.emptyContainer}>
          <Animated.View style={pulseStyle}>
            <Ionicons name="qr-code-outline" size={40} color={colors.textSecondary} />
          </Animated.View>
          <Text style={styles.emptyTitle}>Attendance now runs through NTProxy</Text>
          <Text style={styles.emptyText}>
            Open it above to scan in and see your live percentage per subject.
          </Text>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  ntproxyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ntproxyBannerText: { ...typography.caption, color: colors.textPrimary, flex: 1, fontWeight: "600" },
  emptyContainer: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
