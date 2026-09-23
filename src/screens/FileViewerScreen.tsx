// src/screens/FileViewerScreen.tsx — full replacement
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRoute, RouteProp } from "@react-navigation/native";
import { File } from "expo-file-system";
import { colors, spacing, typography } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import { guessMimeType } from "../utils/fileType";
import type { RootStackParamList } from "../navigation/types";

type ViewerRoute = RouteProp<RootStackParamList, "FileViewer">;

// This screen only ever receives images now — MyDownloadsScreen routes
// PDFs and everything else through expo-sharing's native "open with"
// sheet instead, since WebView (Android especially) has no built-in PDF
// renderer. For images, a raw file:// URI into the app's own sandboxed
// storage looks like it should load fine in a WebView, but modern
// Android WebView refuses it with net::ERR_ACCESS_DENIED — this isn't a
// permission we can grant from JS, it's WebView declining to reach into
// another app's private storage at all.
//
// The fix: don't ask WebView to read the file itself. Read it into a
// base64 data: URI ourselves (expo-file-system) and hand WebView a
// self-contained blob it doesn't need filesystem access for at all.

export default function FileViewerScreen() {
  const { params } = useRoute<ViewerRoute>();
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUri(null);
    setLoadFailed(false);
    (async () => {
      try {
        const file = new File(params.uri);
        const base64 = await file.base64();
        if (!cancelled) {
          setDataUri(`data:${guessMimeType(params.name)};base64,${base64}`);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.uri, params.name]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <ScreenHeader title={params.name} />
      </View>
      {loadFailed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Couldn't preview this image. It's still saved on your device at
            the same location.
          </Text>
        </View>
      ) : !dataUri ? (
        <View style={styles.errorBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <WebView
          source={{ uri: dataUri }}
          style={styles.webview}
          originWhitelist={["*"]}
          renderError={() => (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                Couldn't preview this image. It's still saved on your device
                at the same location.
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  webview: { flex: 1 },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});