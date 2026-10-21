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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchPublications, PublicationCandidate } from "../utils/publicationLookup";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/storage";
import {
  colors,
  spacing,
  radius,
  typography,
} from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { KeyboardAwareScrollView } from "../components/KeyboardAware";

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
  const [aboutMe, setAboutMe] = useState(profile?.aboutMe ?? "");
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
          aboutMe,
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

  const isStudent = profile?.role === "student";
  const isFaculty = profile?.role === "faculty";
  const semester =
    isStudent && profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;

  const phoneField = (hint: string) => (
    <Field label="Phone" hint={hint}>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Leave blank to keep private"
        placeholderTextColor={colors.textSecondary}
        keyboardType="phone-pad"
      />
    </Field>
  );

  return (
    <View style={styles.page}>
      {/* behavior="height" on Android, not undefined — the OS-level resize
          is unreliable on newer Android with edge-to-edge display on. */}
      <KeyboardAvoidingView behavior={undefined} style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <View style={styles.photoCard}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto} activeOpacity={0.85}>
              {uploadingPhoto ? (
                <View style={styles.photo}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.photo} />
              ) : (
                <View style={styles.photo}>
                  <Text style={styles.photoInitial}>{profile?.name?.trim()?.[0]?.toUpperCase() ?? "?"}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color={colors.onPrimary} />
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoName} numberOfLines={1}>
                {name.trim() || profile?.name}
              </Text>
              <Text style={styles.photoHint}>Tap the photo to {profile?.photoUrl ? "change" : "add"} it</Text>
            </View>
          </View>

          <Section title="Basic">
            <Field label="Full name">
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
              />
            </Field>
            <Locked label="Email" value={profile?.email ?? ""} />
          </Section>

          {isStudent && (
            <>
              <Section
                title="College"
                note="These come from the official roster and can't be changed here — contact an admin if anything is wrong."
              >
                <Locked label="Enrollment number" value={profile?.enrollmentNumber ?? "—"} />
                <Locked
                  label="Class"
                  value={[profile?.branch, profile?.section, semester ? `Sem ${semester}` : null].filter(Boolean).join(" · ") || "—"}
                />
              </Section>
              <Section title="Contact">{phoneField("Optional — used for Lost & Found contact.")}</Section>
            </>
          )}

          {isFaculty && (
            <>
              <Section title="Faculty directory" note="Students see these in the Faculty Directory — all optional.">
                <Field label="Department">
                  <ChipPicker value={department} onChange={setDepartment} options={DEPARTMENTS} />
                </Field>
                <Field label="Designation">
                  <ChipPicker value={designation} onChange={setDesignation} options={DESIGNATIONS} />
                </Field>
                <Field label="Office location">
                  <TextInput
                    style={styles.input}
                    value={officeLocation}
                    onChangeText={setOfficeLocation}
                    placeholder="e.g. Faculty Block, Room 204"
                    placeholderTextColor={colors.textSecondary}
                  />
                </Field>
                <Field label="Office hours">
                  <TextInput
                    style={styles.input}
                    value={officeHours}
                    onChangeText={setOfficeHours}
                    placeholder="e.g. Mon–Fri, 2–4 PM"
                    placeholderTextColor={colors.textSecondary}
                  />
                </Field>
              </Section>

              <Section title="Contact">{phoneField("Optional — shown to students.")}</Section>

              <Section title="About you">
                <Field label="A few lines for students">
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={aboutMe}
                    onChangeText={setAboutMe}
                    placeholder="e.g. I teach Data Structures and Operating Systems, and I'm happy to talk about grad school plans."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                  />
                </Field>
                <Field label="Research areas">
                  <TextInput
                    style={styles.input}
                    value={researchAreas}
                    onChangeText={setResearchAreas}
                    placeholder="e.g. Machine Learning, Computer Vision"
                    placeholderTextColor={colors.textSecondary}
                  />
                </Field>
                <Field label="Publications (a count)">
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
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
                      <Text style={styles.lookupButtonText}>Look up</Text>
                    </TouchableOpacity>
                  </View>
                </Field>
              </Section>

              <Modal visible={lookupOpen} animationType="slide" transparent onRequestClose={() => setLookupOpen(false)}>
                <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
                  <View style={styles.modalSheet}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Look up publications</Text>
                      <TouchableOpacity onPress={() => setLookupOpen(false)} hitSlop={8}>
                        <Ionicons name="close" size={22} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.lookupHint}>
                      Searches Semantic Scholar and DBLP (free public research databases) — Google Scholar has no public API.
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
                        {lookupLoading ? (
                          <ActivityIndicator color={colors.surface} />
                        ) : (
                          <Text style={styles.lookupSearchButtonText}>Search</Text>
                        )}
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
                </KeyboardAvoidingView>
              </Modal>
            </>
          )}

          {/* Any other role (admin today) — just the contact phone. */}
          {!isStudent && !isFaculty && <Section title="Contact">{phoneField("Optional — used for Lost & Found contact.")}</Section>}

          {error && <Text style={styles.error}>{error}</Text>}
        </KeyboardAwareScrollView>

        {/* Save stays put at the bottom while you scroll */}
        <View style={styles.saveBar}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveBtnText}>Save changes</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const DEPARTMENTS = [
  "Computer Science and Engineering",
  "Electronics and Communication Engineering",
  "Mathematics and Computational Sciences",
  "Applied Sciences",
  "Humanities and Social Sciences",
];
const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Visiting Faculty", "Adjunct Faculty", "Teaching Assistant"];

// Pick-from-list for fixed values (no typos); a value already saved that
// isn't in the list still shows, selected.
function ChipPicker({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <View style={styles.chipWrap}>
      {all.map((o) => {
        const on = o === value;
        return (
          <TouchableOpacity
            key={o}
            style={[styles.pick, on && styles.pickOn]}
            onPress={() => onChange(on ? "" : o)}
            activeOpacity={0.8}
          >
            {on && <Ionicons name="checkmark" size={14} color={colors.onInk} />}
            <Text style={[styles.pickText, on && styles.pickTextOn]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.locked}>
        <Text style={styles.lockedText} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 18, paddingTop: spacing.md, paddingBottom: 120 },

  photoCard: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.surface, borderRadius: 24, padding: 16 },
  photo: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: colors.tile.blue.bg,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoInitial: { fontSize: 30, fontWeight: "800", color: colors.tile.blue.fg },
  cameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  photoName: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  photoHint: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4 },
  note: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 8, marginHorizontal: 4, lineHeight: 17 },
  field: { paddingVertical: 10 },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 6 },
  fieldHint: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 6 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lockedText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textSecondary },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  pickOn: { backgroundColor: colors.ink },
  pickText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  pickTextOn: { color: colors.onInk },

  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 14,
    marginTop: 16,
    fontSize: 13,
    fontWeight: "600",
  },
  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: colors.background,
  },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },

  lookupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.tile.blue.bg,
  },
  lookupButtonText: { fontSize: 13, color: colors.primary, fontWeight: "800" },
  lookupHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  lookupSearchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  lookupSearchButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    justifyContent: "center",
  },
  lookupSearchButtonText: { color: colors.surface, fontWeight: "700" },
  lookupOption: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 14,
    marginTop: spacing.sm,
  },
  lookupOptionName: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  lookupOptionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
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
