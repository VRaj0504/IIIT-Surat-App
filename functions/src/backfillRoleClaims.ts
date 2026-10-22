import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const backfillRoleClaims = onCall(
  {region: "asia-south1"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    if (callerSnap.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const usersSnap = await db.collection("users").get();
    let updated = 0;
    let skipped = 0;

    for (const doc of usersSnap.docs) {
      const role = doc.data()?.role as string | undefined;
      if (!role) {
        skipped++;
        continue;
      }
      await admin.auth().setCustomUserClaims(doc.id, {role});
      updated++;
    }

    return {updated, skipped, total: usersSnap.size};
  },
);
