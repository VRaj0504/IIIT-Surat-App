import React from 'react';
import { View, Text, StyleSheet, ScrollView, Linking , TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import { placementHighlights, branchStats, BranchStat } from '../data/placement';

export default function PlacementsScreen() {

    const openTnp = () =>{
        console.log('Button pressed!');
        Linking.openURL('https://tnp.iiitsurat.ac.in').catch(() =>{});
    };
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>


        <Text style={styles.title}>Placements</Text>
        <Text style={styles.subtitle}>Updated as of {placementHighlights.date}</Text>

        
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
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.branchCol]}>Branch</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Max</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Avg</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Median</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>%</Text>
          </View>

          
          {branchStats.map((row: BranchStat) => (
            <View
              key={row.branch}
              style={[
                styles.tableRow,
                row.branch === 'Total' && styles.totalRow,
              ]}
            >
              <Text style={[styles.tableCell, styles.branchCol, styles.branchText]}>{row.branch}</Text>
              <Text style={styles.tableCell}>{row.maxPackage}</Text>
              <Text style={styles.tableCell}>{row.avgPackage}</Text>
              <Text style={styles.tableCell}>{row.median}</Text>
              <Text style={styles.tableCell}>{row.placementPercent}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.linkButton} onPress={openTnp}>
          <Text style={styles.linkButtonText}>View full placement data</Text>
          <Ionicons name="open-outline" size={16} color={colors.primary} />
        </TouchableOpacity>

      </ScrollView>

    </SafeAreaView>
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },

  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardValue: { ...typography.h2, color: colors.textPrimary },
  cardLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderRow: { backgroundColor: colors.background },
  tableHeaderText: { color: colors.textSecondary, ...typography.caption },
  totalRow: { backgroundColor: colors.primary + '08' },
  tableCell: { flex: 1, ...typography.caption, color: colors.textPrimary, textAlign: 'center' },
  branchCol: { flex: 1.2, textAlign: 'left' },
  branchText: { fontWeight: '700' },

  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});