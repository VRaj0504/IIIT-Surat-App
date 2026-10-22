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

const SUPPORT_EMAIL = "collegego05@gmail.com";

const faqs: { question: string; answer: string }[] = [
  {
    question: "My timetable or class details are missing",
    answer:
      "Your branch, section and batch come from the official student roster. If they're missing or wrong, email support with your enrollment number and we'll fix the roster entry.",
  },
  {
    question: "How is my attendance percentage worked out?",
    answer:
      "It's the classes you attended out of the classes actually held in each subject. A 2-hour lab counts as 2 classes, and only your own lab batch counts for you. On-duty, approved event excusals and medical leave your teacher confirmed count as attended. The target is 75%.",
  },
  {
    question: "My attendance looks wrong",
    answer: "Ask the subject teacher. They can correct any day from the faculty portal, and the app updates straight away.",
  },
  {
    question: "I'm not getting notifications",
    answer:
      "Allow notifications for CollegeGo in your phone's settings, then check Profile > Notifications to see which kinds are switched on.",
  },
  {
    question: "How does SOS work?",
    answer:
      "Press and hold the SOS button for 2 seconds. The campus doctor, wardens and your emergency contacts are alerted with your location. Your location is used only while an SOS is open.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Profile > Privacy & account > Delete account. Your profile, Lost & Found posts, complaints and counselling requests are deleted. Academic records the institute keeps, such as attendance, grades and leave records, stay.",
  },
  {
    question: "Is CollegeGo an official IIIT Surat app?",
    answer: "No. CollegeGo is an independent app built by a student of IIIT Surat for the IIIT Surat community.",
  },
];

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
            onPress={() => openMail("CollegeGo — Support")}
          >
            <Ionicons name="mail-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Email Support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => openMail("CollegeGo — Bug Report")}
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
  primaryBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
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
