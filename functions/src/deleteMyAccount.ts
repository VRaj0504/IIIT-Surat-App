import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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

  const counts = {
    lostFound: await deleteWhere("lostFoundItems", "postedBy"),
    lostFoundContacts: (await deleteWhere("lostFoundContacts", "contactedByUid")) + (await deleteWhere("lostFoundContacts", "posterUid")),
    counselling: await deleteWhere("counsellingRequests", "studentUid"),
    complaints: await deleteWhere("complaints", "studentUid"),
  };
  await bucket.deleteFiles({prefix: `lostFound/${uid}/`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `profilePhotos/${uid}`}).catch(() => undefined);

  await db.collection("users").doc(uid).delete();

  await admin.auth().deleteUser(uid);
  console.log(`[deleteMyAccount] deleted ${uid}`, counts);
  return {ok: true};
});
