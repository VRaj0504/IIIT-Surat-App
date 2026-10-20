import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import {
  colors,
  spacing,
  radius,
  typography,
  clayShadowSoft,
} from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { uploadResource } from "../../firebase/resourceService";
import { batchChoices, currentAcademicYear, examYearOptions } from "../../utils/academicYear";
import {
  subscribeToCurriculum,
  CurriculumSubject,
} from "../../firebase/curriculumService";

const BRANCHES = ["CSE", "ECE", "MNC"] as const;
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
// Same order as the folders students see.
const TYPES = ["Notes", "Slides", "Assignment", "PYQ"] as const;
const EXAM_YEARS = examYearOptions();
// Newest first, so the common case (this year) is the leftmost chip and
// already selected by default.
const BATCH_CHOICES = batchChoices();

export default function UploadResourceScreen() {
  const { profile } = useAuth();

  const [pickedFile, setPickedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState<(typeof BRANCHES)[number]>("CSE");
  const [semester, setSemester] = useState<(typeof SEMESTERS)[number]>(1);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("Notes");
  const [section, setSection] = useState("");
  const [academicYear, setAcademicYear] = useState<string>(currentAcademicYear());
  // Only for PYQs, and deliberately NOT defaulted: a silent default would
  // quietly file a paper under the wrong year, so the faculty member has
  // to pick it.
  const [examYear, setExamYear] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  // Depends on branch + semester, so declared after both are already set up.
  const [subjectOptions, setSubjectOptions] = useState<CurriculumSubject[]>([]);

  // Re-subscribes to Firestore every time branch or semester changes,
  // so the dropdown always reflects live curriculum data for whatever's
  // currently selected — not a bundled snapshot from build time.
  useEffect(() => {
    const unsubscribe = subscribeToCurriculum(branch, semester, (subjects) => {
      setSubjectOptions(subjects);
      if (subjects.length > 0 && !subjects.some((s) => s.name === subject)) {
        setSubject(subjects[0].name);
      } else if (subjects.length === 0) {
        setSubject("");
      }
    });
    return () => unsubscribe();
  }, [branch, semester]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
      ],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPickedFile(result.assets[0]);
    }
  };

  const handleUpload = async () => {
    if (!pickedFile || !title || !subject || !profile) {
      Alert.alert("Missing info", "Please pick a file and fill in all fields.");
      return;
    }
    if (type === "PYQ" && examYear === null) {
      Alert.alert("Pick the exam year", "Papers are filed by the year the exam was held.");
      return;
    }

    setUploading(true);
    try {
      await uploadResource(pickedFile.uri, pickedFile.name, {
        title,
        subject,
        branch,
        semester,
        section: section.trim() || null,
        type,
        academicYear,
        examYear: type === "PYQ" ? examYear : null,
        uploadedBy: profile.uid,
        uploadedByName: profile.name,
      });
      Alert.alert("Success", "Resource uploaded.");
      setPickedFile(null);
      setTitle("");
      setSection("");
    } catch (err: any) {
      Alert.alert("Upload failed", err.message ?? "Something went wrong.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Upload Resource</Text>

          {/* --- File picker --- */}
          <TouchableOpacity style={styles.filePicker} onPress={pickFile}>
            <Ionicons
              name="document-attach-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.filePickerText} numberOfLines={1}>
              {pickedFile ? pickedFile.name : "Choose a PDF or PPT file"}
            </Text>
          </TouchableOpacity>

          {/* --- Title --- */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Unit 3 Notes"
            placeholderTextColor={colors.textSecondary}
          />

          {/* --- Branch chips (must come before Subject, since Subject depends on it) --- */}
          <Text style={styles.label}>Branch</Text>
          <View style={styles.chipRow}>
            {BRANCHES.map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.chip, branch === b && styles.chipActive]}
                onPress={() => setBranch(b)}
              >
                <Text
                  style={[
                    styles.chipText,
                    branch === b && styles.chipTextActive,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* --- Semester chips (must come before Subject too) --- */}
          <Text style={styles.label}>Semester</Text>
          <View style={styles.chipRow}>
            {SEMESTERS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, semester === s && styles.chipActive]}
                onPress={() => setSemester(s)}
              >
                <Text
                  style={[
                    styles.chipText,
                    semester === s && styles.chipTextActive,
                  ]}
                >
                  Sem {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>


          <Text style={styles.label}>Section (optional)</Text>
          <TextInput
           style={styles.input}
            value={section}
            onChangeText={setSection}
            placeholder="e.g. B or CSE2 — leave blank for all sections"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
          />

          {/* --- Subject chips — auto-populated from curriculum.ts based on Branch + Semester above --- */}
          <Text style={styles.label}>Subject</Text>
          {subjectOptions.length === 0 ? (
            <Text style={styles.emptyHint}>
              No curriculum data for this branch/semester yet.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {subjectOptions.map((s) => (
                <TouchableOpacity
                  key={s.code}
                  style={[styles.chip, subject === s.name && styles.chipActive]}
                  onPress={() => setSubject(s.name)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      subject === s.name && styles.chipTextActive,
                    ]}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* --- Type chips --- */}
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, type === t && styles.chipActive]}
                onPress={() => setType(t)}
              >
                <Text
                  style={[styles.chipText, type === t && styles.chipTextActive]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PYQs are filed by the year the exam was held; everything else
              is filed by which batch it was written for. */}
          {type === "PYQ" ? (
            <>
              <Text style={styles.label}>Exam year</Text>
              <View style={styles.chipRow}>
                {EXAM_YEARS.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.chip, examYear === y && styles.chipActive]}
                    onPress={() => setExamYear(y)}
                  >
                    <Text style={[styles.chipText, examYear === y && styles.chipTextActive]}>
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                Papers stay visible to every future batch, filed under this year.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Visible in</Text>
              <View style={styles.chipRow}>
                {BATCH_CHOICES.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.chip, academicYear === c.value && styles.chipActive]}
                    onPress={() => setAcademicYear(c.value)}
                  >
                    <Text style={[styles.chipText, academicYear === c.value && styles.chipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                {type === "Assignment"
                  ? "Assignments are for subjects that have a lab. Students see them only during the year you choose."
                  : "Students see this only during the year you choose \u2014 later batches won't. (Papers are the exception: they're kept for everyone.)"}
              </Text>
            </>
          )}

          {/* --- Upload button --- */}
          <TouchableOpacity
            style={[
              styles.uploadButton,
              uploading && styles.uploadButtonDisabled,
            ]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.uploadButtonText}>Upload</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...clayShadowSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  filePickerText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    ...clayShadowSoft,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  chipTextActive: { color: colors.surface },
  uploadButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  uploadButtonDisabled: { opacity: 0.6 },
  uploadButtonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: "700",
  },
});
