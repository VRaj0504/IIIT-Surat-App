import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firestore";

export type NotificationPreferences = {
  classReminders: boolean;
  notices: boolean;
  resources: boolean;
  announcements: boolean;
  timetableUpdates: boolean;
  clubEvents: boolean;
};

// Absence of the field entirely (any user who signed up before this
// screen existed) means "everything on" — opt-out, not opt-in, so nobody
// silently stops getting notices they'd expect just because this feature
// shipped after their account did.
const DEFAULTS: NotificationPreferences = {
  classReminders: true,
  notices: true,
  resources: true,
  announcements: true,
  timetableUpdates: true,
  clubEvents: true,
};

export async function getNotificationPreferences(uid: string): Promise<NotificationPreferences> {
  const snap = await getDoc(doc(db, "users", uid));
  const stored = snap.data()?.notificationPreferences as Partial<NotificationPreferences> | undefined;
  return { ...DEFAULTS, ...stored };
}

export async function updateNotificationPreference(
  uid: string,
  key: keyof NotificationPreferences,
  value: boolean,
): Promise<void> {
  const current = await getNotificationPreferences(uid);
  await updateDoc(doc(db, "users", uid), {
    notificationPreferences: { ...current, [key]: value },
  });
}
