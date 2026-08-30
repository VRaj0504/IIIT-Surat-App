import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { postLostFoundItem, LostFoundCategory, LostFoundType } from "../firebase/lostFoundService";
import type { RootStackParamList } from "../navigation/types";

const CATEGORIES: LostFoundCategory[] = [
  "Electronics",
  "Documents/ID Cards",
  "Accessories",
  "Books/Notes",
  "Clothing",
  "Other",
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, "PostLostFound">;

export default function PostLostFoundScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const [type, setType] = useState<LostFoundType>(route.params?.type ?? "lost");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LostFoundCategory>("Other");
  const [location, setLocation] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posting, setPosting] = useState(false);

  // Opens the camera directly — no gallery/camera choice dialog — since
  // reporting a lost/found item is almost always "take a photo of the
  // thing right now", not picking an existing one. quality is capped a
  // bit below max to keep the upload quick without a visible loss of
  // detail; not resizing dimensions here since Firebase Storage handles
  // arbitrary sizes fine for this use case.
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Allow camera access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhoto(result.assets[0]);
    }
  };

  const handlePost = async () => {
    if (!profile) return;
    if (!title.trim()) {
      Alert.alert("Missing title", "Please give this post a title.");
      return;
    }
    setPosting(true);
    try {
      await postLostFoundItem({
        type,
        title,
        description,
        category,
        location,
        postedBy: profile.uid,
        postedByName: profile.name,
        postedByEmail: profile.email,
        postedByPhone: profile.phone ?? null,
        localPhotoUri: photo?.uri ?? null,
      });
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Couldn't post", err.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.header}>Post an item</Text>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, type === "lost" && styles.toggleButtonActive]}
              onPress={() => setType("lost")}
            >
              <Text style={[styles.toggleText, type === "lost" && styles.toggleTextActive]}>I lost this</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, type === "found" && styles.toggleButtonActive]}
              onPress={() => setType("found")}
            >
              <Text style={[styles.toggleText, type === "found" && styles.toggleTextActive]}>I found this</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Black wallet, Blue water bottle"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Any identifying details — brand, contents, condition..."
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>
            {type === "lost" ? "Where you lost it (optional)" : "Where you found it (optional)"}
          </Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Library 2nd floor, CSE Block canteen"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.label}>Photo (optional)</Text>
          {photo ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.removePhotoButton} onPress={() => setPhoto(null)}>
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoPickButton} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.photoPickText}>Add a photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitButton, posting && styles.submitButtonDisabled]}
            onPress={handlePost}
            disabled={posting}
          >
            {posting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>Post</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.md,
  },
  toggleButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, alignItems: "center" },
  toggleButtonActive: { backgroundColor: colors.primary },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  toggleTextActive: { color: colors.surface },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: colors.surface },
  photoPickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  photoPickText: { color: colors.primary, fontWeight: "600" },
  photoPreviewWrap: { position: "relative", alignSelf: "flex-start" },
  photoPreview: { width: 120, height: 120, borderRadius: radius.md },
  removePhotoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
});
