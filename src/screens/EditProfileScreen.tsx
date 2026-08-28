import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { profile, updateProfileName, updateFacultyDetails } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [department, setDepartment] = useState(profile?.department ?? "");
  const [designation, setDesignation] = useState(profile?.designation ?? "");
  const [officeLocation, setOfficeLocation] = useState(profile?.officeLocation ?? "");
  const [officeHours, setOfficeHours] = useState(profile?.officeHours ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateProfileName(name);
      // These fields only matter for faculty (they're what shows up in
      // FacultyDirectoryScreen) — skip the write entirely for students so
      // it doesn't touch fields that don't apply to them.
      if (profile?.role === "faculty") {
        await updateFacultyDetails({ department, designation, officeLocation, officeHours, phone });
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.content}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
          />

          {/* Read-only fields — these come from the roster/allowlist and admin
            records, not something the app lets you self-edit. */}
          <Text style={styles.label}>Email</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{profile?.email}</Text>
          </View>

          {profile?.role === "student" && (
            <>
              <Text style={styles.label}>Enrollment Number</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>
                  {profile?.enrollmentNumber}
                </Text>
              </View>
              <Text style={styles.hint}>
                Enrollment number, branch, and section come from the official
                roster and can't be changed here — contact an admin if any of
                this is wrong.
              </Text>
            </>
          )}

          {profile?.role === "faculty" && (
            <>
              <Text style={styles.hint}>
                These show up in the Faculty Directory so students can find and contact you — all optional.
              </Text>

              <Text style={styles.label}>Department</Text>
              <TextInput
                style={styles.input}
                value={department}
                onChangeText={setDepartment}
                placeholder="e.g. Computer Science and Engineering"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Designation</Text>
              <TextInput
                style={styles.input}
                value={designation}
                onChangeText={setDesignation}
                placeholder="e.g. Assistant Professor"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Office Location</Text>
              <TextInput
                style={styles.input}
                value={officeLocation}
                onChangeText={setOfficeLocation}
                placeholder="e.g. Faculty Block, Room 204"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Office Hours</Text>
              <TextInput
                style={styles.input}
                value={officeHours}
                onChangeText={setOfficeHours}
                placeholder="e.g. Mon-Fri, 2-4 PM"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Phone (optional — shown to students)</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Leave blank to keep private"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderWidth: 1,
    borderColor: "rgba(11,61,145,0.12)",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  readOnlyField: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  readOnlyText: { ...typography.body, color: colors.textSecondary },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    backgroundColor: "#FCEAEB",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    ...typography.caption,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
