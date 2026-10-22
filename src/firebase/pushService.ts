import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "./firestore";

const isExpoGo = Constants.executionEnvironment === "storeClient";

if (!isExpoGo && Platform.OS !== "web") {
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

export async function registerForPushNotificationsAsync(uid: string): Promise<void> {
  if (isExpoGo || Platform.OS === "web") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");

    if (!Device.isDevice) {

      return;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });

      await Notifications.setNotificationChannelAsync("sos", {
        name: "SOS alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400, 200, 800],
        lightColor: "#DC2626",
        sound: "default",
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return;
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

export async function clearPushToken(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { expoPushToken: deleteField() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pushService] clearing token failed (non-fatal):", err);
  }
}
