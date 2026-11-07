
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRoute, RouteProp } from "@react-navigation/native";
import { File } from "expo-file-system";
import { colors, spacing, typography } from "../theme/theme";
import ScreenHeader from "../components/ScreenHeader";
import { guessMimeType } from "../utils/fileType";
import type { RootStackParamList } from "../navigation/types";
import LoadingSpinner from "../components/LoadingSpinner";

type ViewerRoute = RouteProp<RootStackParamList, "FileViewer">;

export default function FileViewerScreen() {
  const { params } = useRoute<ViewerRoute>();
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const share = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing isn't available on this device");
        return;
      }
      await Sharing.shareAsync(params.uri, { mimeType: guessMimeType(params.name), dialogTitle: params.name });
    } catch {
      Alert.alert("Couldn't share", "Try again in a moment.");
    }
  };

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
  }, [params.uri, params.name, attempt]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <ScreenHeader title={params.name} showTitle actionIcon="share-outline" onAction={share} />
      </View>
      {loadFailed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Couldn't preview this file. It's still saved on your phone.
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btn} onPress={() => setAttempt((n) => n + 1)}>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.btnText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={share}>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
              <Text style={styles.btnText}>Open in another app</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !dataUri ? (
        <View style={styles.errorBox}>
          <LoadingSpinner label="Opening file…" />
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
  btnRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: spacing.md },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
});