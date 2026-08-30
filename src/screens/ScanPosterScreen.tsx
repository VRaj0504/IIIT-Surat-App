import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Calendar from "expo-calendar";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, typography, clayShadowSoft } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { scanPoster } from "../firebase/posterScanService";

// IMPORTANT: expo-calendar is unsupported in Expo Go (per Expo's own
// docs) — this whole screen's "Add to Calendar" step only actually works
// in a real dev/production build. The camera/upload → OCR extraction part
// above it works fine in Expo Go regardless, same split as push
// notifications elsewhere in this app.

export default function ScanPosterScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState(false);

  // Editable fields, pre-filled from OCR but never trusted blindly —
  // this is the confirm/edit step the person asked for explicitly.
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(""); // "YYYY-MM-DD"
  const [time, setTime] = useState(""); // "HH:mm"
  const [location, setLocation] = useState("");
  const [adding, setAdding] = useState(false);

  const handleScan = async (source: "camera" | "library") => {
    if (!profile) return;
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo library"} access to scan a poster.`);
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (result.canceled || result.assets.length === 0) return;

      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      setScanning(true);
      setExtracted(false);

      const extraction = await scanPoster(uri, profile.uid);
      setTitle(extraction.guessedTitle ?? "");
      setDate(extraction.guessedDate ?? "");
      setTime(extraction.guessedTime ?? "");
      setExtracted(true);
    } catch (err: any) {
      Alert.alert("Couldn't scan", err.message ?? "Please try again, or fill the details in manually below.");
      setExtracted(true); // let them fill in manually even if OCR failed
    } finally {
      setScanning(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!title.trim() || !date.trim()) {
      Alert.alert("Missing details", "At least a title and date are needed.");
      return;
    }
    const startDate = new Date(`${date.trim()}T${time.trim() || "09:00"}:00`);
    if (isNaN(startDate.getTime())) {
      Alert.alert("Invalid date/time", "Use YYYY-MM-DD for the date and HH:mm for the time.");
      return;
    }
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // default 1-hour event

    setAdding(true);
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow calendar access to add this event.");
        return;
      }

      // Default calendar differs by platform — iOS has a single writable
      // default; Android needs picking one from the device's actual list
      // of calendars (there's no universal "default" concept there).
      let calendarId: string;
      if (Calendar.getDefaultCalendarAsync) {
        const defaultCalendar = await Calendar.getDefaultCalendarAsync();
        calendarId = defaultCalendar.id;
      } else {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const writable = calendars.find((c: Calendar.Calendar) => c.allowsModifications);
        if (!writable) throw new Error("No writable calendar found on this device.");
        calendarId = writable.id;
      }

      await Calendar.createEventAsync(calendarId, {
        title: title.trim(),
        startDate,
        endDate,
        location: location.trim() || undefined,
        notes: "Added from a scanned poster — IIIT Surat App",
      });

      Alert.alert("Added to calendar", `"${title.trim()}" was added to your calendar.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert("Couldn't add to calendar", err.message ?? "Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>Scan Event Poster</Text>
          <Text style={styles.helper}>
            Scan or upload a poster — we'll try to pull out the title, date, and time. Always
            double-check before adding to your calendar.
          </Text>

          {!photoUri && (
            <View style={styles.sourceRow}>
              <TouchableOpacity style={styles.sourceButton} onPress={() => handleScan("camera")}>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.sourceButtonText}>Scan with Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sourceButton} onPress={() => handleScan("library")}>
                <Ionicons name="image-outline" size={22} color={colors.primary} />
                <Text style={styles.sourceButtonText}>Choose from Photos</Text>
              </TouchableOpacity>
            </View>
          )}

          {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

          {scanning && (
            <View style={styles.scanningRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.scanningText}>Reading the poster…</Text>
            </View>
          )}

          {extracted && (
            <>
              <Text style={styles.label}>Event Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Tech Fest 2026"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-08-25"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Time (24-hour, optional — defaults to 9:00 AM)</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="17:00"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Location (optional)</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Main Auditorium"
                placeholderTextColor={colors.textSecondary}
              />

              <TouchableOpacity
                style={[styles.addButton, adding && styles.addButtonDisabled]}
                onPress={handleAddToCalendar}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.addButtonText}>Add to Calendar</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setPhotoUri(null);
                  setExtracted(false);
                  setTitle("");
                  setDate("");
                  setTime("");
                  setLocation("");
                }}
                style={{ marginTop: spacing.md, alignItems: "center" }}
              >
                <Text style={styles.rescanText}>Scan a different poster</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.h2, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  sourceRow: { flexDirection: "row", gap: spacing.md },
  sourceButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    ...clayShadowSoft,
  },
  sourceButtonText: { ...typography.body, color: colors.textPrimary, fontWeight: "600", textAlign: "center" },
  preview: { width: "100%", height: 220, borderRadius: radius.lg, marginBottom: spacing.md },
  scanningRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", marginVertical: spacing.md },
  scanningText: { ...typography.body, color: colors.textSecondary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 4, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
    ...clayShadowSoft,
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: colors.surface, fontWeight: "700", fontSize: 16 },
  rescanText: { color: colors.primary, fontWeight: "600" },
});
