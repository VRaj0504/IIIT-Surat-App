import React, { useEffect } from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import BrandMark, { BRAND, DOT_CENTER, DOT_RADIUS } from "./BrandMark";
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

  size?: number;

  variant?: "brand" | "dots";
  label?: string;

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

export default function LoadingSpinner({ style, size, variant = "brand", label, large }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (variant !== "brand") return;
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const w = large ? 64 : 40;
  const dotR = DOT_RADIUS * w;
  const dotX = DOT_CENTER.x * w;
  const dotY = DOT_CENTER.y * w;

  const markStyle = useAnimatedStyle(() => {
    const p = Math.sin(t.value * Math.PI * 2);
    return { transform: [{ translateY: -2.5 * p }] };
  });
  const pingStyle = useAnimatedStyle(() => {
    const e = 1 - Math.pow(1 - t.value, 3);
    return { opacity: 0.75 * (1 - t.value), transform: [{ scale: 1 + e * 2.6 }] };
  });
  const dotStyle = useAnimatedStyle(() => {
    const k = t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85;
    return { transform: [{ scale: 1 + 0.22 * k }] };
  });

  if (variant === "dots") {
    return (
      <View style={[styles.center, style]}>
        <Dots size={size ?? 8} />
      </View>
    );
  }

  const ring = { position: "absolute" as const, left: dotX - dotR, top: dotY - dotR, width: dotR * 2, height: dotR * 2, borderRadius: dotR };

  return (
    <View style={[styles.center, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <Animated.View style={[{ width: w, height: w }, markStyle]}>
        <View style={[styles.tileShadow, { width: w, height: w, borderRadius: w * 0.235 }]}>
          <BrandMark size={w} dot={false} />
        </View>
        <Animated.View pointerEvents="none" style={[ring, styles.ping, pingStyle]} />
        <Animated.View pointerEvents="none" style={[ring, styles.dot, dotStyle]} />
      </Animated.View>
      {(label || large) && <Text style={[styles.label, large && styles.labelLg]}>{label ?? "Loading…"}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  tileShadow: { shadowColor: BRAND.indigo, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5, backgroundColor: BRAND.indigo },
  ping: { borderWidth: 2, borderColor: BRAND.mint, backgroundColor: "rgba(108,240,216,0.25)" },
  dot: { backgroundColor: BRAND.mint },
  label: { marginTop: 12, fontSize: 13, fontWeight: "600", color: colors.textSecondary, letterSpacing: 0.2 },
  labelLg: { marginTop: 16, fontSize: 14 },
});
