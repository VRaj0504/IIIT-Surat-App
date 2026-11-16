import React, { useEffect } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors, spacing, radius } from "../theme/theme";

export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[s.bone, style, a]} />;
}

export function SkeletonCard({ lines = 2, avatar = false }: { lines?: number; avatar?: boolean }) {
  return (
    <View style={s.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.row}>
        {avatar && <Bone style={s.avatar} />}
        <View style={{ flex: 1, gap: 8 }}>
          <Bone style={{ width: "62%", height: 14 }} />
          <Bone style={{ width: "38%", height: 10 }} />
        </View>
      </View>
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} style={{ width: i === lines - 1 ? "70%" : "100%", height: 10, marginTop: 10 }} />
      ))}
    </View>
  );
}

export default function SkeletonList({ count = 4, lines = 2, avatar = true, style }: { count?: number; lines?: number; avatar?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: spacing.sm }, style]} accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} avatar={avatar} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  bone: { backgroundColor: colors.surfaceAlt, borderRadius: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20 },
});
