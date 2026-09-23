import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  radius,
  typography,
} from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";

const SUPPORT_EMAIL = "rajvaibhav068@gmail.com";

const faqs: { question: string; answer: string }[] = [
  
];

// Was a flat list of question+answer pairs, all expanded all the time —
// four answers' worth of text always on screen whether or not anyone
// wanted to read them. An accordion (tap a question, only that one
// answer expands) is the standard, expected shape for an FAQ section:
// scan the questions first, open only the one that's actually relevant.
function FaqItem({ item }: { item: { question: string; answer: string } }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <TouchableOpacity style={styles.faqCard} onPress={toggle} activeOpacity={0.7}>
      <View style={styles.faqQuestionRow}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textSecondary}
        />
      </View>
      {open && <Text style={styles.faqAnswer}>{item.answer}</Text>}
    </TouchableOpacity>
  );
}

export default function HelpSupportScreen() {
  const openMail = (subject: string) => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`,
    ).catch(() => {});
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader
            title="Help & Support"
            subtitle="Stuck on something, or found a bug? Reach out directly."
          />

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => openMail("IIIT Surat App — Support")}
          >
            <Ionicons name="mail-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Email Support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => openMail("IIIT Surat App — Bug Report")}
          >
            <Ionicons name="bug-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Report a Bug</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Frequently Asked</Text>
          {faqs.map((item, i) => (
            <FaqItem key={i} item={item} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  primaryBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  faqQuestion: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    flex: 1,
  },
  faqAnswer: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
