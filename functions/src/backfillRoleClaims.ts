import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// One-time (or run-again-whenever-safe) callable: sets the `role`
// custom claim for every account that predates syncRoleClaim.ts — that
// trigger only fires on a WRITE to a user's doc, so anyone who signed
// up before it was deployed has no claim yet, and their rules checks
// keep falling through to the original get()-based check (see the
// isAdmin()/isFaculty() fallback in firestore.rules) until this runs.
//
// Safe to run more than once, and safe to run while some accounts
// already have the claim — it just re-sets it to the same value for
// those. Admin-only, checked via the SAME get()-based method the rules
// themselves fall back to (not the claim), since the caller's own
// token may not have the claim yet either — this callable doesn't get
// to assume the very thing it exists to fix.
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

    // Sequential, not Promise.all — this is a rare, manually-triggered
    // admin action, not a hot path, so there's no reason to burst
    // hundreds of concurrent Admin SDK calls at once.
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
