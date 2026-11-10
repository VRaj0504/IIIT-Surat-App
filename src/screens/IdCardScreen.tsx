import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { colors, radius, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";

function Field({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <View style={[styles.field, wide && { width: "100%" }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

/** A student's digital ID: who they are, plus a QR of their registration number that staff can scan. */
export default function IdCardScreen() {
  const { profile } = useAuth();
  const regNo = profile?.enrollmentNumber ?? "";
  const semester =
    profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const initial = (profile?.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.band}>
            <Text style={styles.bandText}>STUDENT ID</Text>
          </View>
          <View style={styles.top}>
            {profile?.photoUrl ? (
              <Image source={{ uri: profile.photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                <Text style={styles.photoInitial}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{profile?.name}</Text>
              <Text style={styles.reg}>{regNo || "No registration number on your profile"}</Text>
            </View>
          </View>
          <View style={styles.fields}>
            <Field label="Programme" value={profile?.program === "PG" ? "Postgraduate" : "Undergraduate"} />
            <Field label="Branch" value={profile?.branch} />
            <Field label="Section" value={profile?.section} />
            <Field label="Semester" value={semester} />
            <Field label="Batch" value={profile?.admissionYear} />
            <Field label="Email" value={profile?.email} wide />
          </View>
          {!!regNo && (
            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <QRCode value={regNo} size={170} color="#0E1A33" backgroundColor="#FFFFFF" />
              </View>
              <Text style={styles.hint}>Show this code when staff ask for your ID.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  band: { backgroundColor: colors.primary, paddingVertical: 10, alignItems: "center" },
  bandText: { color: colors.onPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.md },
  photo: { width: 72, height: 72, borderRadius: 18 },
  photoEmpty: { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  photoInitial: { fontSize: 28, fontWeight: "800", color: colors.primary },
  name: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  reg: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  fields: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.md, rowGap: 12 },
  field: { width: "50%" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
  qrWrap: { alignItems: "center", padding: spacing.lg },
  qrBox: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: radius.md },
  hint: { fontSize: 13, color: colors.textSecondary, marginTop: 12, textAlign: "center" },
});
