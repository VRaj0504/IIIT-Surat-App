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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Resources downloaded via ResourcesScreen.tsx land in Paths.document
// (the app's own private storage). This screen lists what's actually
// sitting in that folder, right from the filesystem itself, so a
// download is something you can find and reopen again later — not just
// bytes that quietly landed somewhere invisible.
export default function MyDownloadsScreen() {
  const navigation = useNavigation<NavProp>();
  const [files, setFiles] = useState<File[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  // Images preview fine inside the app's own WebView. Everything else
  // (PDFs especially) needs to leave the app entirely.
  //
  // expo-sharing's shareAsync fires Android's ACTION_SEND intent — that's
  // a "send this content TO another app" chooser, which only lists apps
  // registered to receive shared content (WhatsApp, Drive's "upload",
  // Gmail...). A dedicated PDF *viewer* (Adobe Acrobat, Drive's own PDF
  // viewer, the OS default) registers for ACTION_VIEW instead — "open
  // this content" — a different intent that ACTION_SEND's chooser never
  // surfaces, which is exactly why the share sheet showed WhatsApp/Upload
  // but no way to actually view the file. Firing ACTION_VIEW directly
  // (via expo-intent-launcher) gets the right chooser.
  //
  // ACTION_VIEW needs a content:// URI, not our raw file:// one — Android
  // blocks exposing a file:// URI from the app's private storage to
  // another app outright (FileUriExposedException), regardless of any
  // permission we grant. getContentUriAsync wraps it through a
  // FileProvider so another app can actually read it once we grant
  // FLAG_GRANT_READ_URI_PERMISSION (flags: 1) on the intent.
  //
  // iOS has no such ACTION_VIEW/ACTION_SEND split — the one share sheet
  // there already offers a Quick Look preview plus "Copy to Files", so
  // the old shareAsync path stays for iOS.
  const openFile = useCallback(
    async (file: File) => {
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
            flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
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
        // Android throws here (rather than resolving with a Canceled
        // result) when no installed app handles ACTION_VIEW for this
        // MIME type at all — i.e. no PDF viewer on the device.
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
      const onlyFiles = entries.filter((e): e is File => e instanceof File);
      setFiles(onlyFiles);
    } catch {
      setFiles([]);
    }
  }, []);

  // Refreshes every time this screen comes into focus, not just once on
  // mount — otherwise downloading something new in Resources and coming
  // back here wouldn't show it until the app fully reloaded.
  useFocusEffect(refresh);

  const handleDelete = useCallback(
    (file: File) => {
      Alert.alert("Delete download?", `"${file.name}" will be removed from your device.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            try {
              file.delete();
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
                <Text style={styles.rowName}>{item.name}</Text>
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