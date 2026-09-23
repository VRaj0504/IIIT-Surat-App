import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
  Modal,
  FlatList,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchPublications, PublicationCandidate } from "../utils/publicationLookup";
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
  const [researchAreas, setResearchAreas] = useState(profile?.researchAreas ?? "");
  const [publicationsCount, setPublicationsCount] = useState(
    profile?.publicationsCount != null ? String(profile.publicationsCount) : "",
  );
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState(profile?.name ?? "");
  const [lookupResults, setLookupResults] = useState<PublicationCandidate[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const runLookup = async () => {
    const trimmed = lookupQuery.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const results = await searchPublications(trimmed);
      setLookupResults(results);
      if (results.length === 0) setLookupError("No matches found — try a fuller version of the name.");
    } catch (err: any) {
      setLookupResults(null);
      setLookupError(err.message ?? "Something went wrong.");
    } finally {
      setLookupLoading(false);
    }
  };

  const pickCandidate = (candidate: PublicationCandidate) => {
    if (candidate.paperCount != null) {
      setPublicationsCount(String(candidate.paperCount));
      setLookupOpen(false);
      Alert.alert(
        "Found it",
        `Set to ${candidate.paperCount}, from ${candidate.source === "dblp" ? "DBLP" : "Semantic Scholar"}. Double-check this is really you, then press Save below.`,
      );
    } else {
      Alert.alert(
        "No count available",
        "DBLP matched a profile but doesn't give a publication count here — open the profile link to check it yourself, then type the number in by hand.",
        candidate.profileUrl
          ? [{ text: "Open profile" as any, onPress: () => Linking.openURL(candidate.profileUrl!).catch(() => {}) }, { text: "OK" as any }]
          : undefined,
      );
    }
  };
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
        await updateFacultyDetails({
          department,
          designation,
          officeLocation,
          officeHours,
          phone,
          researchAreas,
          publicationsCount: publicationsCount.trim() ? Number(publicationsCount.trim()) : null,
        });
      } else if (profile?.role === "student") {
        await updatePhone(phone);
      } else {
        // Any other role (admin today) — same as the student path, just
        // the plain phone field, not the faculty-directory fields.
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
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
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

              <Text style={styles.label}>Research Areas</Text>
              <TextInput
                style={styles.input}
                value={researchAreas}
                onChangeText={setResearchAreas}
                placeholder="e.g. Machine Learning, Computer Vision"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Publications (just a count, not a list)</Text>
              <TextInput
                style={styles.input}
                value={publicationsCount}
                onChangeText={(v) => setPublicationsCount(v.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 12"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={styles.lookupButton}
                onPress={() => {
                  setLookupQuery(profile?.name ?? "");
                  setLookupResults(null);
                  setLookupError(null);
                  setLookupOpen(true);
                }}
              >
                <Ionicons name="search-outline" size={16} color={colors.primary} />
                <Text style={styles.lookupButtonText}>Look up my count (DBLP / Semantic Scholar)</Text>
              </TouchableOpacity>

              <Modal visible={lookupOpen} animationType="slide" transparent onRequestClose={() => setLookupOpen(false)}>
                <View style={styles.modalOverlay}>
                  <View style={styles.modalSheet}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Look up publications</Text>
                      <TouchableOpacity onPress={() => setLookupOpen(false)} hitSlop={8}>
                        <Ionicons name="close" size={22} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.lookupHint}>
                      Not Google Scholar — there's no public API for that. This searches Semantic Scholar and DBLP
                      instead, both free public research databases.
                    </Text>
                    <View style={styles.lookupSearchRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={lookupQuery}
                        onChangeText={setLookupQuery}
                        placeholder="Full name to search"
                        placeholderTextColor={colors.textSecondary}
                        autoFocus
                        onSubmitEditing={runLookup}
                      />
                      <TouchableOpacity style={styles.lookupSearchButton} onPress={runLookup} disabled={lookupLoading}>
                        {lookupLoading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.lookupSearchButtonText}>Search</Text>}
                      </TouchableOpacity>
                    </View>
                    {lookupError && <Text style={styles.emptyNote}>{lookupError}</Text>}
                    <FlatList
                      data={lookupResults ?? []}
                      keyExtractor={(item, i) => `${item.source}-${item.profileUrl ?? item.name}-${i}`}
                      style={styles.modalList}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.lookupOption} onPress={() => pickCandidate(item)}>
                          <Text style={styles.lookupOptionName}>{item.name}</Text>
                          <Text style={styles.lookupOptionMeta}>
                            {item.source === "dblp" ? "DBLP" : "Semantic Scholar"}
                            {item.affiliation ? ` · ${item.affiliation}` : ""}
                            {item.paperCount != null ? ` · ${item.paperCount} publications` : " · count not available"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </View>
              </Modal>
            </>
          )}

          {/* Any role other than the two above — admin accounts are the
            real case today (set directly in Firestore for access to
            Inbox Imports etc., outside the normal signup flow the Role
            type covers), but this also protects any future role from
            silently having no way to set a contact phone at all, the
            exact gap that left an admin's Lost & Found phone field
            invisible even though the phone value itself was already
            saved. */}
          {profile?.role !== "student" && profile?.role !== "faculty" && (
            <>
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
         </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex : 1},
  contentContainer: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
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
  hint: {    ...typography.caption,
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
  lookupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
  },
  lookupButtonText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  lookupHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  lookupSearchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  lookupSearchButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: "center",
  },
  lookupSearchButtonText: { color: colors.surface, fontWeight: "700" },
  lookupOption: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  lookupOptionName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  lookupOptionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  modalList: { marginTop: spacing.sm },
  emptyNote: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.md, textAlign: "center" },
});