import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing } from "../theme/theme";
import appJson from "../../app.json";

const APP_VERSION = appJson.expo?.version ?? "1.0.0";

export default function AboutScreen() {
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.mark}>
            <Text style={styles.markText}>CG</Text>
          </View>
          <Text style={styles.title}>CollegeGo</Text>
          <View style={styles.version}>
            <Text style={styles.versionText}>Version {APP_VERSION}</Text>
          </View>
          <Text style={styles.paragraph}>
            Everyday campus life in one place — so getting through the day at IIIT Surat takes less digging around
            and fewer scattered links.
          </Text>
        </View>

        <View style={styles.credit}>
          <Text style={styles.creditLabel}>Made by</Text>
          <Text style={styles.creditName}>Vaibhav Raj</Text>
          <Text style={styles.creditMeta}>CSE · Batch of 2029</Text>
        </View>

        <Text style={styles.footer}>For the students and faculty of IIIT Surat.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: spacing.xl * 2 },
  hero: { backgroundColor: colors.surface, borderRadius: 26, padding: 22, alignItems: "center" },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  markText: { color: colors.onPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.textPrimary },
  version: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  versionText: { fontSize: 12, fontWeight: "800", color: colors.textSecondary },
  paragraph: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 14,
  },
  credit: { backgroundColor: colors.ink, borderRadius: 24, padding: 20, alignItems: "center", marginTop: 20 },
  creditLabel: { fontSize: 12, fontWeight: "700", color: colors.inkMuted },
  creditName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, color: colors.onInk, marginTop: 2 },
  creditMeta: { fontSize: 13, fontWeight: "600", color: colors.inkMuted, marginTop: 2 },
  footer: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 20, textAlign: "center" },
});
