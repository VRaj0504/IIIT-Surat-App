import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import {
  placementHighlights,
  branchStats,
  BranchStat,
} from "../data/placement";

export default function PlacementsScreen() {
  const openTnp = () => {
    Linking.openURL("https://tnp.iiitsurat.ac.in").catch(() => {});
  };
  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            Updated as of {placementHighlights.date}
          </Text>

          <View style={styles.highlightsGrid}>
            <HighlightCard
              icon="business-outline"
              label="Companies Visited"
              value={placementHighlights.companiesVisited}
            />
            <HighlightCard
              icon="ribbon-outline"
              label="Offers Made"
              value={placementHighlights.offers}
            />
            <HighlightCard
              icon="trending-up-outline"
              label="Highest Package"
              value={placementHighlights.highest}
            />
            <HighlightCard
              icon="stats-chart-outline"
              label="Placement %"
              value={placementHighlights.placementPercent}
            />
          </View>

          <Text style={styles.sectionTitle}>Branch-wise Breakdown</Text>
          {branchStats.map((row: BranchStat) => (
            <View key={row.branch} style={[styles.branchCard, row.branch === "Total" && styles.branchCardTotal]}>
              <View style={styles.branchHead}>
                <Text style={[styles.branchName, row.branch === "Total" && { color: colors.onPrimary }]}>
                  {row.branch === "Total" ? "All branches" : row.branch}
                </Text>
                <View style={[styles.pctPill, row.branch === "Total" && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                  <Text style={[styles.pctText, row.branch === "Total" && { color: colors.onPrimary }]}>{row.placementPercent} placed</Text>
                </View>
              </View>
              <View style={styles.statRow}>
                {[
                  ["Highest", row.maxPackage],
                  ["Average", row.avgPackage],
                  ["Median", row.median],
                ].map(([k, v]) => (
                  <View key={k} style={styles.stat}>
                    <Text style={[styles.statVal, row.branch === "Total" && { color: colors.onPrimary }]}>{String(v).replace(/\s*LPA$/i, "")}</Text>
                    <Text style={[styles.statLbl, row.branch === "Total" && { color: colors.heroMuted }]}>{k} · LPA</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.linkButton} onPress={openTnp}>
            <Text style={styles.linkButtonText}>View full placement data</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

type HighlightCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

function HighlightCard({ icon, label, value }: HighlightCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  branchCard: { backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  branchCardTotal: { backgroundColor: colors.primary, borderColor: colors.primary },
  branchHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  branchName: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  pctPill: { backgroundColor: colors.successBg, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  pctText: { fontSize: 12, fontWeight: "800", color: colors.successFg },
  statRow: { flexDirection: "row", marginTop: spacing.sm },
  stat: { flex: 1 },
  statVal: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  statLbl: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, marginTop: 1 },
  container: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  highlightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...clayShadowSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  cardValue: { ...typography.h2, color: colors.textPrimary },
  cardLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...clayShadowSoft,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderRow: { backgroundColor: colors.background },
  tableHeaderText: { color: colors.textSecondary, ...typography.caption },
  totalRow: { backgroundColor: colors.primary + "08" },
  tableCell: {
    flex: 1,
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },
  branchCol: { flex: 1.2, textAlign: "left" },
  branchText: { fontWeight: "700" },

  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
  },
});
