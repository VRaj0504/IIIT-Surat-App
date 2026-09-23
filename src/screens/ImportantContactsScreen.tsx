import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";

type Contact = {
  role: string;
  name: string;
  email?: string;
  phone?: string;
};

// Source: Hostel Warden Information page, iiitsurat.ac.in (Hostel
// Facilities > Hostel Committee), captured 2026-09-10.
const HOSTEL_CONTACTS: Contact[] = [
  { role: "Chief Warden", name: "Dr. Sivavenkateswara Rao V.", email: "chief.warden@iiitsurat.ac.in", phone: "+916203075101" },
  { role: "Faculty Warden (Boys Hostel)", name: "Dr. Manish Kumar Rai", email: "manish.rai@iiitsurat.ac.in", phone: "+919161336525" },
  { role: "Faculty Warden (Boys Hostel)", name: "Dr. Vijay Kumar Patel", email: "vijay.patel@iiitsurat.ac.in", phone: "+919026050579" },
  { role: "Boys Hostel Warden", name: "Mr. Ketan Parmar", email: "ketan.parmar@iiitsurat.ac.in", phone: "+917878394950" },
  { role: "Faculty Warden (Girls Hostel)", name: "Dr. Khamosh Yadav", email: "khamosh.yadav@iiitsurat.ac.in" },
  { role: "Faculty Warden (Girls Hostel)", name: "Dr. Shikha Maurya", email: "shikha.maurya@iiitsurat.ac.in" },
];

// No confirmed medical-authority contact yet — placeholder so the
// section isn't silently missing. Replace once the real name/number is
// available (institute medical officer / health centre).
const MEDICAL_CONTACTS: Contact[] = [];

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <View style={styles.card}>
      <Text style={styles.role}>{contact.role}</Text>
      <Text style={styles.name}>{contact.name}</Text>
      <View style={styles.actions}>
        {contact.phone && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL(`tel:${contact.phone}`).catch(() => {})}
          >
            <Ionicons name="call-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>{contact.phone}</Text>
          </TouchableOpacity>
        )}
        {contact.email && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL(`mailto:${contact.email}`).catch(() => {})}
          >
            <Ionicons name="mail-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>{contact.email}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function ImportantContactsScreen() {
  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Important Contacts</Text>
          <Text style={styles.subtitle}>Hostel administration and campus support</Text>

          <Text style={styles.sectionTitle}>Hostel Committee</Text>
          {HOSTEL_CONTACTS.map((c, i) => (
            <ContactCard key={i} contact={c} />
          ))}

          <Text style={styles.sectionTitle}>Medical Authority</Text>
          {MEDICAL_CONTACTS.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Not added yet — send over the medical officer / health centre
                contact and it'll go here.
              </Text>
            </View>
          ) : (
            MEDICAL_CONTACTS.map((c, i) => <ContactCard key={i} contact={c} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...clayShadowSoft,
  },
  role: { ...typography.caption, color: colors.textSecondary },
  name: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...clayShadowSoft,
  },
  emptyText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
});
