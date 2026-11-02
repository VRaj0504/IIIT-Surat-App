import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

export async function useDailyQuota(uid: string, key: string, limit: number): Promise<void> {
  const day = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ref = getFirestore().collection("aiUsage").doc(`${uid}_${key}_${day}`);
  const allowed = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.count as number | undefined) ?? 0;
    if (used >= limit) return false;
    tx.set(ref, {uid, key, day, count: used + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
  if (!allowed) {
    throw new HttpsError("resource-exhausted", `Daily limit reached (${limit} scans a day). Try again tomorrow.`);
  }
}
