import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "./firestore";

// How the app should show a notification while it's open in the
// foreground — without this, foreground notifications are silent on some
// platforms by default.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Registers this device for push and saves the resulting Expo push token
// onto the signed-in user's profile — call this once after login/signup.
// Deliberately swallows failures rather than throwing: push is an add-on,
// never something that should block someone from using the app if their
// device or permissions don't cooperate.
//
// IMPORTANT: this only actually delivers a remote push on a real device
// running a proper dev/production build — Expo Go on Android has not
// supported remote push since SDK 53. Calling this in Expo Go is safe (it
// just won't produce a usable token there), so this can ship now without
// breaking anything for anyone still on Expo Go.
export async function registerForPushNotificationsAsync(uid: string): Promise<void> {
  try {
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
