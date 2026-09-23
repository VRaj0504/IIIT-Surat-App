import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "./firestore";

// Android push (remote notifications) was removed from Expo Go entirely
// as of SDK 53 — not a permissions issue, not something try/catch can
// paper over. The real problem: expo-notifications throws from its OWN
// internal module-scope setup the MOMENT it's imported on Android in
// Expo Go, before any of our own function bodies ever run — so wrapping
// registerForPushNotificationsAsync in try/catch (which it already was)
// never helped, because the crash happens at import time, not call time.
// The only real fix is to never import the module at all while running
// in Expo Go. A static `import * as Notifications from "expo-notifications"`
// at the top of this file would get evaluated immediately regardless of
// any runtime check placed around its use — so this uses a plain
// `require()` instead, called only after confirming we're NOT in Expo
// Go, which Metro is fine executing conditionally (unlike a hoisted
// static import).
const isExpoGo = Constants.executionEnvironment === "storeClient";

// How the app should show a notification while it's open in the
// foreground — without this, foreground notifications are silent on some
// platforms by default. Skipped entirely in Expo Go, same reasoning as
// registerForPushNotificationsAsync below.
if (!isExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Registers this device for push and saves the resulting Expo push token
// onto the signed-in user's profile — call this once after login/signup.
// Deliberately swallows failures rather than throwing: push is an add-on,
// never something that should block someone from using the app if their
// device or permissions don't cooperate.
//
// IMPORTANT: this only actually delivers a remote push on a real device
// running a proper dev/production build — Expo Go on Android has not
// supported remote push since SDK 53. In Expo Go this is a no-op (see
// isExpoGo above) rather than attempting anything, since even trying to
// touch expo-notifications there is what caused the crash, not just
// "safe but useless."
export async function registerForPushNotificationsAsync(uid: string): Promise<void> {
  if (isExpoGo) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");

    if (!Device.isDevice) {
      // Simulators/emulators can't receive real push tokens.
      return;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return; // person declined — respect that, don't nag
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.warn("[pushService] no EAS projectId found — can't get an Expo push token");
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    await updateDoc(doc(db, "users", uid), { expoPushToken: tokenResponse.data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pushService] registration failed (non-fatal):", err);
  }
}

// Called on sign-out — removes the stale token so a signed-out device
// doesn't keep receiving another user's pushes if someone else signs into
// the same phone afterward.
export async function clearPushToken(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { expoPushToken: deleteField() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pushService] clearing token failed (non-fatal):", err);
  }
}
