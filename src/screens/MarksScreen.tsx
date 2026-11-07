import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { orderedComponents, subscribeToMyMarks, type SubjectMarks } from "../firebase/marksService";
import LoadingSpinner from "../components/LoadingSpinner";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

function SubjectCard({ m }: { m: SubjectMarks }) {
  const comps = orderedComponents(m);
  const scored = comps.filter((c) => c.score != null || c.absent);
  const got = scored.reduce((s, c) => s + (c.score ?? 0), 0);
  const out = scored.reduce((s, c) => s + c.max, 0);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subject}>{m.subjectName}</Text>
          <Text style={styles.code}>{m.subjectCode}</Text>
        </View>
        {out > 0 ? (
          <View style={styles.totalPill}>
            <Text style={styles.totalText}>
              {fmt(got)}
              <Text style={styles.totalOf}> / {out}</Text>
            </Text>
          </View>
        ) : null}
      </View>
      {comps.map((c) => {
        const pct = c.score != null && c.max ? c.score / c.max : 0;
        return (
          <View key={c.id} style={styles.row}>
            <Text style={styles.label}>{c.label}</Text>
            <View style={styles.barTrack}>
              {c.score != null ? <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }, pct < 0.4 && styles.barLow]} /> : null}
            </View>
            <Text style={[styles.score, c.absent && styles.absent]}>
              {c.absent ? "Absent" : c.score == null ? "—" : `${fmt(c.score)} / ${c.max}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function MarksScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState<SubjectMarks[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.enrollmentNumber) {
      setLoading(false);
      return;
    }
    return subscribeToMyMarks(profile.enrollmentNumber, (list) => {
      setItems(list);
      setLoading(false);
    });
  }, [profile?.enrollmentNumber]);

  const bySem = useMemo(() => {
    const m = new Map<number, SubjectMarks[]>();
    items.forEach((x) => m.set(x.semester, [...(m.get(x.semester) ?? []), x]));
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [items]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>Quiz, mid-sem and other marks uploaded by your faculty. Final grades are in Transcript.</Text>
          {loading ? (
            <LoadingSpinner style={{ marginTop: spacing.xl }} />
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No marks uploaded yet.</Text>
            </View>
          ) : (
            bySem.map(([sem, list]) => (
              <View key={sem}>
                <Text style={styles.semTitle}>Semester {sem}</Text>
                {list.map((m) => (
                  <SubjectCard key={m.id} m={m} />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  empty: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  semTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...clayShadowSoft },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  subject: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  code: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  totalPill: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  totalText: { color: colors.onPrimary, fontWeight: "800", fontSize: 15 },
  totalOf: { fontWeight: "600", fontSize: 12, opacity: 0.85 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  label: { ...typography.body, color: colors.textPrimary, width: 92 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  barLow: { backgroundColor: colors.danger },
  score: { width: 74, textAlign: "right", fontWeight: "700", color: colors.textPrimary },
  absent: { color: colors.danger },
});
