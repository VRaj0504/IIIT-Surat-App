import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius } from "../../theme/theme";
import type { GridStudent } from "./RollGrid";

function tap() {
  if (Platform.OS === "web") return;
  try {
    require("expo-haptics").selectionAsync();
  } catch {
    return;
  }
}

function warn() {
  if (Platform.OS === "web") return;
  try {
    const H = require("expo-haptics");
    H.notificationAsync(H.NotificationFeedbackType.Error);
  } catch {
    return;
  }
}

export default function RollNumberPad({
  students,
  absent,
  onToggle,
}: {
  students: GridStudent[];
  absent: Set<string>;
  onToggle: (reg: string) => void;
}) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");

  const byTail = useMemo(() => {
    const m = new Map<string, GridStudent[]>();
    for (const s of students) {
      const tail = String(Number(s.enrollmentNumber.slice(-3)));
      m.set(tail, [...(m.get(tail) ?? []), s]);
    }
    return m;
  }, [students]);

  const matches = entry ? byTail.get(String(Number(entry))) ?? [] : [];
  const absentList = students.filter((s) => absent.has(s.enrollmentNumber));

  const press = (k: string) => {
    tap();
    setError("");
    setEntry((e) => (e.length >= 3 ? e : e + k));
  };

  const add = () => {
    if (!entry) return;
    if (matches.length !== 1) {
      warn();
      setError(matches.length ? `${entry} matches more than one student. Use the grid.` : `${entry} is not in this class.`);
      return;
    }
    const reg = matches[0].enrollmentNumber;
    if (!absent.has(reg)) onToggle(reg);
    setEntry("");
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];

  return (
    <View>
      <View style={styles.display}>
        <Text style={[styles.entry, !entry && styles.entryEmpty]}>{entry || "Roll no."}</Text>
        <Text style={[styles.preview, !!error && { color: colors.danger }]} numberOfLines={1}>
          {error || (matches.length === 1 ? matches[0].name : entry ? "No match yet" : "Type the last digits of each absent student")}
        </Text>
      </View>

      {absentList.length > 0 && (
        <View style={styles.chips}>
          {absentList.map((s) => (
            <TouchableOpacity key={s.enrollmentNumber} style={styles.chip} onPress={() => onToggle(s.enrollmentNumber)} accessibilityLabel={`Mark ${s.name} present`}>
              <Text style={styles.chipText}>
                {s.enrollmentNumber.slice(-3)} · {s.name.split(" ")[0]}
              </Text>
              <Ionicons name="close" size={14} color={colors.danger} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.pad}>
        {keys.map((k) => (
          <Pressable
            key={k}
            onPress={() => (k === "del" ? (tap(), setError(""), setEntry((e) => e.slice(0, -1))) : k === "ok" ? add() : press(k))}
            onLongPress={() => k === "del" && setEntry("")}
            accessibilityRole="button"
            accessibilityLabel={k === "del" ? "Delete digit" : k === "ok" ? "Mark absent" : k}
            style={({ pressed }) => [styles.key, k === "ok" && styles.keyOk, pressed && { opacity: 0.6, transform: [{ scale: 0.96 }] }]}
          >
            {k === "del" ? (
              <Ionicons name="backspace-outline" size={22} color={colors.textPrimary} />
            ) : k === "ok" ? (
              <Text style={styles.keyOkText}>Absent</Text>
            ) : (
              <Text style={styles.keyText}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  display: { marginTop: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  entry: { fontSize: 36, fontWeight: "800", letterSpacing: 2, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  entryEmpty: { color: colors.textSecondary, fontSize: 24, letterSpacing: 0 },
  preview: { marginTop: 4, fontSize: 13.5, fontWeight: "600", color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 34, borderRadius: radius.full, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger + "40" },
  chipText: { fontSize: 12.5, fontWeight: "700", color: colors.danger },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, marginTop: spacing.md },
  key: { width: "32%", height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  keyOk: { backgroundColor: colors.danger, borderColor: colors.danger },
  keyText: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  keyOkText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
});
