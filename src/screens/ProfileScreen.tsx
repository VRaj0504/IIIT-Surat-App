import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, Switch, ScrollView, Image, Linking, ActivityIndicator } from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/functionsClient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing, typography } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import TapCard from "../components/TapCard";

// Public pages on the faculty portal's hosting (also given to the app stores).
export const PRIVACY_URL = "https://collegego-iiitsurat.web.app/privacy.html";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type Row = {
  label: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: keyof RootStackParamList;
  tone: keyof typeof colors.tile;
};

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Account",
    rows: [
      { label: "Notifications", sub: "What the app pings you about", icon: "notifications-outline", route: "NotificationSettings", tone: "lilac" },
      { label: "My downloads", sub: "Files saved on this phone", icon: "download-outline", route: "MyDownloads", tone: "mint" },
    ],
  },
  {
    title: "Help",
    rows: [
      { label: "Help & support", sub: "Report a problem", icon: "help-circle-outline", route: "HelpSupport", tone: "peach" },
      { label: "Important contacts", sub: "Office, hostel, medical", icon: "call-outline", route: "ImportantContacts", tone: "pink" },
      { label: "About", sub: "Version and credits", icon: "information-circle-outline", route: "About", tone: "yellow" },
    ],
  },
];

function initialsOf(name: string): string {
  return (
    name
      .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function ProfileScreen() {
  const { profile, logOut, previewRole, setPreviewRole } = useAuth();
  const navigation = useNavigation<NavProp>();
  const isStudent = profile?.role === "student";
  const semester =
    isStudent && profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  const chips = isStudent
    ? [profile?.enrollmentNumber, [profile?.branch, profile?.section].filter(Boolean).join(" · "), semester ? `Sem ${semester}` : null]
    : [profile?.role === "faculty" ? profile?.designation || "Faculty" : profile?.role, profile?.department];

  const [deleting, setDeleting] = useState(false);

  // Required by Google Play and the App Store: delete the account from inside the app.
  const handleDelete = () => {
    Alert.alert(
      "Delete your account?",
      "Your CollegeGo account and profile (phone, emergency contacts, lost & found posts, complaints, counselling requests) are deleted permanently.\n\nYour attendance, grades and other academic records stay with the institute.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            Alert.alert("Are you sure?", "This can't be undone.", [
              { text: "Keep my account", style: "cancel" },
              {
                text: "Delete forever",
                style: "destructive",
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await httpsCallable(functions, "deleteMyAccount")();
                    await logOut().catch(() => {});
                    Alert.alert("Account deleted", "Your account has been deleted.");
                  } catch (e: any) {
                    Alert.alert("Couldn't delete", `${e?.message ?? "Please try again."}\n\nYou can also request deletion at ${PRIVACY_URL.replace("privacy", "delete-account")}`);
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logOut() },
    ]);
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.h1}>Profile</Text>

          {/* Who you are */}
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsOf(profile?.name ?? "?")}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {profile?.name ?? "Loading…"}
                </Text>
                <Text style={styles.email} numberOfLines={1}>
                  {profile?.email}
                </Text>
              </View>
            </View>
            <View style={styles.chips}>
              {chips.filter(Boolean).map((c) => (
                <View key={String(c)} style={styles.chip}>
                  <Text style={styles.chipText}>{c}</Text>
                </View>
              ))}
            </View>
            <TapCard style={styles.editBtn} onPress={() => navigation.navigate("EditProfile" as any)}>
              <Ionicons name="create-outline" size={16} color={colors.ink} />
              <Text style={styles.editText}>Edit profile</Text>
            </TapCard>
          </View>

          {GROUPS.map((g) => (
            <View key={g.title}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              <View style={styles.card}>
                {g.rows.map((row, i) => (
                  <TapCard
                    key={row.label}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    onPress={() => navigation.navigate(row.route as any)}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.tile[row.tone].bg }]}>
                      <Ionicons name={row.icon} size={18} color={colors.tile[row.tone].fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TapCard>
                ))}
              </View>
            </View>
          ))}

          {/* Dev-only convenience for previewing the faculty screens
              without changing your real role in Firestore — setPreviewRole
              no-ops for any other account. */}
          {profile?.email === "ug25cse114@iiitsurat.ac.in" && (
            <View style={[styles.card, styles.row, { marginTop: 14 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="flask-outline" size={18} color={colors.textSecondary} />
              </View>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Preview as faculty</Text>
              <Switch
                value={previewRole === "faculty"}
                onValueChange={(value) => setPreviewRole(value ? "faculty" : null)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          )}

          <Text style={styles.groupTitle}>Privacy & account</Text>
          <View style={styles.card}>
            <TapCard style={styles.row} onPress={() => Linking.openURL(PRIVACY_URL)}>
              <View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Privacy policy</Text>
                <Text style={styles.rowSub}>How your data is used</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            </TapCard>
            <TapCard style={[styles.row, styles.rowDivider]} onPress={handleLogout}>
              <View style={[styles.rowIcon, { backgroundColor: colors.dangerBg }]}>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.danger, flex: 1 }]}>Log out</Text>
            </TapCard>
            <TapCard style={[styles.row, styles.rowDivider]} onPress={deleting ? undefined : handleDelete}>
              <View style={[styles.rowIcon, { backgroundColor: colors.dangerBg }]}>
                {deleting ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={18} color={colors.danger} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.danger }]}>{deleting ? "Deleting…" : "Delete account"}</Text>
                <Text style={styles.rowSub}>Permanently removes your data</Text>
              </View>
            </TapCard>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 18, paddingTop: spacing.md, paddingBottom: 110 },
  h1: { ...typography.h1, color: colors.textPrimary, marginBottom: 14 },

  hero: { backgroundColor: colors.ink, borderRadius: 26, padding: 18, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  name: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4, color: colors.onInk },
  email: { fontSize: 13, fontWeight: "600", color: colors.inkMuted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onInk },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 11,
  },
  editText: { fontSize: 14, fontWeight: "800", color: colors.ink },

  groupTitle: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.2 },
  rowSub: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 1 },
  logout: { marginTop: 14 },
});
