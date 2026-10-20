import React, { useEffect } from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  type SharedValue,
} from "react-native-reanimated";
import { colors } from "../theme/theme";

type Props = {
  style?: StyleProp<ViewStyle>;
  // Dot size for the "dots" variant (kept for older call sites).
  size?: number;
  // "brand" (default): the IIIT Surat "IS" mark breathing inside a
  // spinning arc. "dots": three pulsing dots, for tight spots.
  variant?: "brand" | "dots";
  label?: string;
  // Bigger mark + caption, for full-screen loading (app start).
  large?: boolean;
};

const pulse = (v: SharedValue<number>, delay: number) => {
  v.value = withDelay(
    delay,
    withRepeat(
      withSequence(
        withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
        withTiming(0.35, { duration: 380, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    ),
  );
};

function Dots({ size = 8, color = colors.primary }: { size?: number; color?: string }) {
  const a = useSharedValue(0.35);
  const b = useSharedValue(0.35);
  const c = useSharedValue(0.35);
  useEffect(() => {
    pulse(a, 0);
    pulse(b, 140);
    pulse(c, 280);
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
      cancelAnimation(c);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sa = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ scale: 0.6 + a.value * 0.4 }] }));
  const sb = useAnimatedStyle(() => ({ opacity: b.value, transform: [{ scale: 0.6 + b.value * 0.4 }] }));
  const sc = useAnimatedStyle(() => ({ opacity: c.value, transform: [{ scale: 0.6 + c.value * 0.4 }] }));
  const dot = { width: size, height: size, borderRadius: size / 2, backgroundColor: color };
  return (
    <View style={styles.row}>
      <Animated.View style={[dot, sa]} />
      <Animated.View style={[dot, sb]} />
      <Animated.View style={[dot, sc]} />
    </View>
  );
}

// The app-wide loader: the "IS" mark gently breathing inside a spinning
// arc — the same loader as the faculty web portal, so both feel like one
// product. Only transform/opacity animate (UI thread, no re-renders).
export default function LoadingSpinner({ style, size, variant = "brand", label, large }: Props) {
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (variant !== "brand") return;
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + breathe.value * 0.08 }],
    opacity: 0.85 + breathe.value * 0.15,
  }));

  if (variant === "dots") {
    return (
      <View style={[styles.center, style]}>
        <Dots size={size ?? 8} />
      </View>
    );
  }

  const box = large ? 84 : 52;
  const mark = large ? 52 : 32;
  const ring = { width: box, height: box, borderRadius: box / 2, borderWidth: large ? 4 : 3 };

  return (
    <View style={[styles.center, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.track, ring]} />
        <Animated.View style={[styles.arc, ring, ringStyle]} />
        <Animated.View style={[styles.mark, { width: mark, height: mark, borderRadius: mark * 0.28 }, markStyle]}>
          <Text style={[styles.markText, { fontSize: mark * 0.4 }]}>CG</Text>
        </Animated.View>
      </View>
      {(label || large) && <Text style={styles.label}>{label ?? "Loading…"}</Text>}
      {large && (
        <View style={{ marginTop: 10 }}>
          <Dots size={6} color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  track: { position: "absolute", borderColor: colors.badge.blue.bg },
  arc: {
    position: "absolute",
    borderColor: "transparent",
    borderTopColor: colors.primary,
    borderRightColor: colors.primary,
  },
  mark: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  markText: { color: colors.onPrimary, fontWeight: "800", letterSpacing: 0.5 },
  label: { marginTop: 14, fontSize: 13, fontWeight: "600", color: colors.textSecondary },
});
