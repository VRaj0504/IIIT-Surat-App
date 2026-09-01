import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/storage";
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
  const { profile, updateProfileName, updateFacultyDetails, updatePhone, updatePhoto } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [department, setDepartment] = useState(profile?.department ?? "");
  const [designation, setDesignation] = useState(profile?.designation ?? "");
  const [officeLocation, setOfficeLocation] = useState(profile?.officeLocation ?? "");
  const [officeHours, setOfficeHours] = useState(profile?.officeHours ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickPhoto = async () => {
    if (!profile) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to set a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploadingPhoto(true);
    try {
      // Fixed filename per user (not timestamped) — re-uploading replaces
      // the old photo in Storage rather than accumulating orphaned files
      // nobody ever cleans up.
      const photoRef = ref(storage, `profilePhotos/${profile.uid}/photo.jpg`);
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      await uploadBytes(photoRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(photoRef);
      await updatePhoto(url);
    } catch (err: any) {
      Alert.alert("Couldn't upload photo", err.message ?? "Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

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
      } else if (profile?.role === "student") {
        await updatePhone(phone);
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
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <View style={styles.photoCircle}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.photoCircle} />
              ) : (
                <View style={styles.photoCircle}>
                  <Text style={styles.photoInitial}>{profile?.name?.trim()?.[0]?.toUpperCase() ?? "?"}</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.photoHint}>Tap to {profile?.photoUrl ? "change" : "add"} photo</Text>
          </View>

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

              <Text style={styles.label}>Phone (optional — used for Lost &amp; Found contact)</Text>
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
  photoSection: { alignItems: "center", marginBottom: spacing.md },
  photoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoInitial: { fontSize: 36, fontWeight: "800", color: colors.primary },
  photoHint: { ...typography.caption, color: colors.primary, marginTop: spacing.xs, fontWeight: "600" },
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
