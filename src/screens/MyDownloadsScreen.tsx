import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, radius, typography } from "../theme/theme";
import type { RootStackParamList } from "../navigation/types";
import ScreenHeader from "../components/ScreenHeader";
import { guessMimeType, isPreviewableInWebView } from "../utils/fileType";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Saved on this phone";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SavedFile = { uri: string; name: string; size: number | null };

export default function MyDownloadsScreen() {
  const navigation = useNavigation<NavProp>();

  const [files, setFiles] = useState<SavedFile[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  const openFile = useCallback(
    async (file: SavedFile) => {
      if (isPreviewableInWebView(file.name)) {
        navigation.navigate("FileViewer", { uri: file.uri, name: file.name });
        return;
      }
      setOpening(file.uri);
      try {
        if (Platform.OS === "android") {
          const contentUri = await getContentUriAsync(file.uri);
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: 1,
            type: guessMimeType(file.name),
          });
          return;
        }
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert(
            "Can't open this file type",
            `No app on this device can open "${file.name}". It's still saved here — try again after installing a PDF viewer.`,
          );
          return;
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: guessMimeType(file.name),
          dialogTitle: file.name,
        });
      } catch (err: any) {

        Alert.alert(
          "No app found to open this file",
          `Install a PDF viewer (or a file manager with one built in) — "${file.name}" is still saved here and will open once you have one.`,
        );
      } finally {
        setOpening(null);
      }
    },
    [navigation],
  );

  const refresh = useCallback(() => {
    try {
      const entries = Paths.document.list();
      const snapshots: SavedFile[] = [];
      for (const e of entries) {
        if (!(e instanceof File)) continue;
        try {
          if (!e.exists) continue;
          let size: number | null = null;
          try {
            size = e.size ?? null;
          } catch {
            size = null;
          }
          snapshots.push({ uri: e.uri, name: e.name, size });
        } catch {

        }
      }
      setFiles(snapshots);
    } catch {
      setFiles([]);
    }
  }, []);

  useFocusEffect(refresh);

  const handleDelete = useCallback(
    (file: SavedFile) => {
      Alert.alert("Delete download?", `"${file.name}" will be removed from your device.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            try {
              new File(file.uri).delete();
              refresh();
            } catch (err: any) {
              Alert.alert("Couldn't delete", err.message ?? "Something went wrong.");
            }
          },
        },
      ]);
    },
    [refresh],
  );

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader title="My Downloads" subtitle="Saved for offline viewing" />
        <FlatList
          data={files}
          keyExtractor={(f) => f.uri}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nothing downloaded yet — use the download icon on any resource to save it here.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => openFile(item)}
              disabled={opening === item.uri}
            >
              {opening === item.uri ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="document-outline" size={20} color={colors.primary} />
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name.replace(/_/g, " ")}</Text>
                <Text style={styles.rowMeta}>{formatBytes(item.size)}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md },
  list: { paddingBottom: spacing.xl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowInfo: { flex: 1 },
  rowName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  rowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});