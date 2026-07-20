import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';

const SUPPORT_EMAIL = 'rajvaibhav068@gmail.com';

const faqs: { question: string; answer: string }[] = [
  {
    question: "I can't log in / it says incorrect email or password.",
    answer: 'Double-check your email is typed exactly as you signed up with, and that Caps Lock isn\'t on for your password. If you\'re sure it\'s right, use "Forgot password" on the login screen, or reach out below.',
  },
  {
    question: 'Sign up says my enrollment number wasn\'t found on the roster.',
    answer: 'Your enrollment number needs to already be on the official student roster before you can sign up. If you just joined or think this is a mistake, contact an admin or email support below with your enrollment number.',
  },
  {
    question: 'Sign up says my email isn\'t on the approved faculty list.',
    answer: 'Faculty accounts are gated the same way — your email needs to be pre-approved by an admin. Email support below to get added.',
  },
  {
    question: 'I uploaded a resource/notice and it disappeared or failed.',
    answer: 'This usually means a permissions issue on our end, not something you did wrong. Screenshot the error if you can and send it over — it helps us fix it faster.',
  },
];

export default function HelpSupportScreen() {
  const openMail = (subject: string) => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Help & Support</Text>
        <Text style={styles.subtitle}>Stuck on something, or found a bug? Reach out directly.</Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => openMail('IIIT Surat App — Support')}>
          <Ionicons name="mail-outline" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Email Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => openMail('IIIT Surat App — Bug Report')}>
          <Ionicons name="bug-outline" size={18} color={colors.primary} />
          <Text style={styles.secondaryBtnText}>Report a Bug</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Frequently Asked</Text>
        {faqs.map((item, i) => (
          <View key={i} style={styles.faqCard}>
            <Text style={styles.faqQuestion}>{item.question}</Text>
            <Text style={styles.faqAnswer}>{item.answer}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  primaryBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  faqQuestion: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.xs },
  faqAnswer: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
});
