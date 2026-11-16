import React, { memo, useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { colors, spacing, radius } from "../../theme/theme";

export type GridStudent = { enrollmentNumber: string; name: string };

function tick(absent: boolean) {
  if (Platform.OS === "web") return;
  try {
    const H = require("expo-haptics");
    if (absent) H.impactAsync(H.ImpactFeedbackStyle.Medium);
    else H.selectionAsync();
  } catch {
    return;
  }
}

const Tile = memo(function Tile({
  s,
  absent,
  duty,
  size,
  onToggle,
  onPeek,
}: {
  s: GridStudent;
  absent: boolean;
  duty: boolean;
  size: number;
  onToggle: (reg: string) => void;
  onPeek: (s: GridStudent | null) => void;
}) {
  return (
    <Pressable
      onPress={() => {
        tick(!absent);
        onToggle(s.enrollmentNumber);
      }}
      onLongPress={() => onPeek(s)}
      onPressOut={() => onPeek(null)}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityState={{ selected: absent }}
      accessibilityLabel={`${s.name}, roll ${s.enrollmentNumber}, ${absent ? "absent" : "present"}`}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        absent ? styles.tileAbsent : styles.tilePresent,
        pressed && { transform: [{ scale: 0.94 }] },
      ]}
    >
      <Text style={[styles.num, absent && styles.numAbsent]}>{s.enrollmentNumber.slice(-3)}</Text>
      <Text style={[styles.first, absent && styles.firstAbsent]} numberOfLines={1}>
        {s.name.split(" ")[0]}
      </Text>
      {duty && <View style={styles.dutyDot} />}
    </Pressable>
  );
});

export default function RollGrid({
  students,
  absent,
  onDuty,
  onToggle,
}: {
  students: GridStudent[];
  absent: Set<string>;
  onDuty: Map<string, string>;
  onToggle: (reg: string) => void;
}) {
  const { width } = useWindowDimensions();
  const avail = Math.min(width, 520) - spacing.md * 2;
  const cols = avail >= 420 ? 6 : 5;
  const gap = 8;
  const size = Math.floor((avail - gap * (cols - 1)) / cols);
  const [peek, setPeek] = useState<GridStudent | null>(null);
  const onPeek = useCallback((s: GridStudent | null) => setPeek(s), []);

  return (
    <View>
      <Text style={styles.hint}>
        {peek ? `${peek.name} · ${peek.enrollmentNumber}${onDuty.get(peek.enrollmentNumber) ? ` · on event duty` : ""}` : "Everyone starts present. Tap a roll number to mark absent. Hold to see the name."}
      </Text>
      <View style={[styles.grid, { gap }]}>
        {students.map((s) => (
          <Tile
            key={s.enrollmentNumber}
            s={s}
            absent={absent.has(s.enrollmentNumber)}
            duty={onDuty.has(s.enrollmentNumber)}
            size={size}
            onToggle={onToggle}
            onPeek={onPeek}
          />
        ))}
      </View>
      {onDuty.size > 0 && <Text style={styles.legend}>Purple dot: on approved event duty, counted as attended either way.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { minHeight: 34, fontSize: 12.5, lineHeight: 17, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tile: { borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  tilePresent: { backgroundColor: colors.surface, borderColor: colors.border },
  tileAbsent: { backgroundColor: colors.danger, borderColor: colors.danger },
  num: { fontSize: 19, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  numAbsent: { color: "#FFFFFF" },
  first: { marginTop: 1, maxWidth: "88%", fontSize: 10.5, fontWeight: "600", color: colors.textSecondary },
  firstAbsent: { color: "rgba(255,255,255,0.85)" },
  dutyDot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.tile.lilac.fg },
  legend: { marginTop: spacing.sm, fontSize: 11.5, color: colors.textSecondary },
});
