import { Alert, Platform } from "react-native";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { guessMimeType, isPreviewableInWebView } from "./fileType";

export async function openLocalFile(uri: string, name: string, showImage: (uri: string, name: string) => void): Promise<void> {
  if (isPreviewableInWebView(name)) {
    showImage(uri, name);
    return;
  }
  try {
    if (Platform.OS === "android") {
      const contentUri = await getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: guessMimeType(name),
      });
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Can't open this file type", `No app on this device can open "${name}".`);
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: guessMimeType(name), dialogTitle: name });
  } catch {
    Alert.alert("No app found to open this file", `Install an app that opens this kind of file (for example a PDF viewer or Office), then try again.`);
  }
}
