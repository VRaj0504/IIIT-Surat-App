import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing } from "../../theme/theme";

export type RollStudent = { enrollmentNumber: string; name: string; branch?: string };
type Mark = "P" | "A";

function buzz(kind: Mark) {
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const H = require("expo-haptics");
    if (kind === "A") H.notificationAsync(H.NotificationFeedbackType.Warning);
    else H.impactAsync(H.ImpactFeedbackStyle.Light);
  } catch {
    return;
  }
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export const RollCallCard = memo(function RollCallCard({
  students,
  index,
  marks,
  absentCount,
  onMark,
  onUndo,
  onRestPresent,
}: {
  students: RollStudent[];
  index: number;
  marks: Map<string, Mark>;
  absentCount: number;
  onMark: (reg: string, m: Mark) => void;
  onUndo: () => void;
  onRestPresent: () => void;
}) {
  const { width } = useWindowDimensions();
  const s = students[index];
  const x = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(1)).current;
  const total = students.length;
  const absentSoFar = absentCount;
  const prev = index > 0 ? students[index - 1] : null;
  const prevMark = prev ? marks.get(prev.enrollmentNumber) : undefined;

  useEffect(() => {
    x.setValue(0);
    enter.setValue(0.6);
    Animated.timing(enter, { toValue: 1, duration: 110, useNativeDriver: Platform.OS !== "web" }).start();
  }, [index, x, enter]);

  const commit = (m: Mark) => {
    if (!s) return;
    buzz(m);
    x.setValue(0);
    onMark(s.enrollmentNumber, m);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => x.setValue(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dx > 90) commit("P");
          else if (g.dx < -90) commit("A");
          else Animated.spring(x, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s?.enrollmentNumber, width],
  );

  if (!s) return null;
  const rotate = x.interpolate({ inputRange: [-width, 0, width], outputRange: ["-12deg", "0deg", "12deg"] });
  const presentHint = x.interpolate({ inputRange: [0, 90], outputRange: [0, 1], extrapolate: "clamp" });
  const absentHint = x.interpolate({ inputRange: [-90, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <View>
      <View style={st.progressRow}>
        <Text style={st.progressText}>
          {index + 1} <Text style={st.progressOf}>of {total}</Text>
        </Text>
        <Text style={st.progressAbsent}>{absentSoFar} absent</Text>
      </View>
      <View style={st.track}>
        <View style={[st.trackFill, { width: `${Math.round((index / total) * 100)}%` }]} />
      </View>

      <Animated.View {...pan.panHandlers} style={[st.card, { opacity: enter, transform: [{ translateX: x }, { rotate }, { scale }] }]}>
        <Animated.View style={[st.stamp, st.stampP, { opacity: presentHint }]}>
          <Text style={[st.stampText, { color: colors.success }]}>PRESENT</Text>
        </Animated.View>
        <Animated.View style={[st.stamp, st.stampA, { opacity: absentHint }]}>
          <Text style={[st.stampText, { color: colors.danger }]}>ABSENT</Text>
        </Animated.View>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{initials(s.name)}</Text>
        </View>
        <Text style={st.name} numberOfLines={2}>
          {s.name}
        </Text>
        <Text style={st.reg}>{s.enrollmentNumber}</Text>
        <Text style={st.roll}>Roll {s.enrollmentNumber.slice(-3)}</Text>
        <Text style={st.swipeHint}>Swipe right for present, left for absent</Text>
      </Animated.View>

      <View style={st.bigRow}>
        <TouchableOpacity style={[st.big, st.bigA]} onPress={() => commit("A")} accessibilityRole="button" accessibilityLabel={`Mark ${s.name} absent`}>
          <Ionicons name="close" size={30} color={colors.danger} />
          <Text style={[st.bigText, { color: colors.danger }]}>Absent</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.big, st.bigP]} onPress={() => commit("P")} accessibilityRole="button" accessibilityLabel={`Mark ${s.name} present`}>
          <Ionicons name="checkmark" size={30} color={colors.onPrimary} />
          <Text style={[st.bigText, { color: colors.onPrimary }]}>Present</Text>
        </TouchableOpacity>
      </View>

      <View style={st.footRow}>
        <TouchableOpacity style={st.link} onPress={onUndo} disabled={!prev}>
          <Ionicons name="arrow-undo" size={16} color={prev ? colors.primary : colors.textSecondary} />
          <Text style={[st.linkText, !prev && { color: colors.textSecondary }]} numberOfLines={1}>
            {prev ? `Undo ${prev.name.split(" ")[0]} (${prevMark === "A" ? "A" : "P"})` : "Undo"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.link} onPress={onRestPresent}>
          <Ionicons name="checkmark-done" size={16} color={colors.primary} />
          <Text style={st.linkText}>Rest present</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: spacing.md },
  progressText: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  progressOf: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  progressAbsent: { fontSize: 13, fontWeight: "700", color: colors.danger },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 8, overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 220,
    justifyContent: "center",
  },
  stamp: { position: "absolute", top: 18, borderWidth: 3, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  stampP: { left: 18, borderColor: colors.success, transform: [{ rotate: "-12deg" }] },
  stampA: { right: 18, borderColor: colors.danger, transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 18, fontWeight: "900", letterSpacing: 1.5 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 26, fontWeight: "800", color: colors.primary },
  name: { marginTop: spacing.md, fontSize: 24, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  reg: { marginTop: 6, fontSize: 15, fontWeight: "600", color: colors.textSecondary, letterSpacing: 0.5 },
  roll: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  swipeHint: { marginTop: spacing.sm, fontSize: 11, color: colors.textSecondary },
  bigRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  big: { flex: 1, height: 88, borderRadius: 24, alignItems: "center", justifyContent: "center", gap: 2 },
  bigA: { backgroundColor: colors.danger + "14", borderWidth: 2, borderColor: colors.danger + "55" },
  bigP: { backgroundColor: colors.success },
  bigText: { fontSize: 16, fontWeight: "800" },
  footRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, gap: spacing.md },
  link: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, flexShrink: 1 },
  linkText: { fontSize: 14, fontWeight: "700", color: colors.primary },
});

