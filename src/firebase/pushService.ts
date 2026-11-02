import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { doc, getDoc, updateDoc, deleteField, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firestore";

const isExpoGo = Constants.executionEnvironment === "storeClient";
let thisDeviceToken: string | null = null;

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

      await Notifications.setNotificationChannelAsync("updates", {
        name: "College updates",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await Notifications.setNotificationChannelAsync("class-reminders", {
        name: "Class reminders",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
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
    thisDeviceToken = tokenResponse.data;
    await updateDoc(doc(db, "users", uid), { expoPushToken: tokenResponse.data, expoPushTokens: arrayUnion(tokenResponse.data) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pushService] registration failed (non-fatal):", err);
  }
}

export async function clearPushToken(uid: string): Promise<void> {
  if (isExpoGo || Platform.OS === "web" || !thisDeviceToken) return;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const patch: Record<string, unknown> = { expoPushTokens: arrayRemove(thisDeviceToken) };
    if (snap.data()?.expoPushToken === thisDeviceToken) patch.expoPushToken = deleteField();
    await updateDoc(doc(db, "users", uid), patch);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pushService] clearing token failed (non-fatal):", err);
  }
}
