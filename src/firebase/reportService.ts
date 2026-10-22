import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "./firestore";

export const REPORT_REASONS = [
  "Spam or fake post",
  "Inappropriate or offensive",
  "Harassment or abuse",
  "Shares someone's private information",
  "Other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export async function reportContent(p: {
  kind: "lostFound";
  itemId: string;
  itemTitle: string;
  postedBy: string;
  postedByName: string;
  reason: ReportReason;
  reporterUid: string;
  reporterName: string;
}): Promise<void> {
  await addDoc(collection(db, "reports"), {
    ...p,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

const KEY = (uid: string) => `blockedUsers:${uid}`;

export async function getBlockedUids(myUid: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY(myUid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function blockUser(myUid: string, theirUid: string): Promise<string[]> {
  const cur = await getBlockedUids(myUid);
  const next = cur.includes(theirUid) ? cur : [...cur, theirUid];
  try {
    await AsyncStorage.setItem(KEY(myUid), JSON.stringify(next));
  } catch {
    /* hiding still works for this session */
  }
  return next;
}

export async function unblockAll(myUid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY(myUid));
  } catch {
    /* nothing to do */
  }
}
