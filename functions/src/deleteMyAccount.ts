import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// "Delete my account" (required by Google Play and the App Store).
// Removes the person's account and the personal data that belongs only to
// them. Academic and safety records the institute keeps (roster entry,
// attendance, grades, leave applications, SOS alert history) are NOT
// deleted — that's stated in the privacy policy.
export const deleteMyAccount = onCall({region: "asia-south1"}, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const deleteWhere = async (collection: string, field: string) => {
    try {
      const snap = await db.collection(collection).where(field, "==", uid).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      return snap.size;
    } catch (e) {
      console.error(`[deleteMyAccount] ${collection}.${field}:`, e);
      return 0;
    }
  };

  // Personal content
  const counts = {
    lostFound: await deleteWhere("lostFoundItems", "postedBy"),
    lostFoundContacts: (await deleteWhere("lostFoundContacts", "contactedByUid")) + (await deleteWhere("lostFoundContacts", "posterUid")),
    counselling: await deleteWhere("counsellingRequests", "studentUid"),
    complaints: await deleteWhere("complaints", "studentUid"),
  };
  await bucket.deleteFiles({prefix: `lostFound/${uid}/`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `profilePhotos/${uid}`}).catch(() => undefined);

  // Profile (name, email, phone, photo, push token, emergency contacts…)
  await db.collection("users").doc(uid).delete();

  // The sign-in account itself — last, so a failure above can be retried.
  await admin.auth().deleteUser(uid);
  console.log(`[deleteMyAccount] deleted ${uid}`, counts);
  return {ok: true};
});
