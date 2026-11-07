import { DevSettings, Platform } from "react-native";

/** Restarts the app so screens pick up new settings (like the theme). Returns false if it couldn't. */
export async function restartApp(): Promise<boolean> {
  if (Platform.OS === "web") {
    globalThis.location?.reload();
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require("expo-updates");
    if (Updates?.reloadAsync) {
      await Updates.reloadAsync();
      return true;
    }
  } catch {
    // expo-updates not in this build, or reload not allowed here
  }
  if (__DEV__ && DevSettings?.reload) {
    DevSettings.reload();
    return true;
  }
  return false;
}
