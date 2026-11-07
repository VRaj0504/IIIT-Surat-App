import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {getStorage} from "firebase-admin/storage";

export const deleteMyAccount = onCall({region: "asia-south1"}, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  // Deleting is permanent, so ask for a fresh sign-in (stops someone using a phone left logged in).
  const signedInAt = Number(req.auth?.token?.auth_time ?? 0) * 1000;
  if (!signedInAt || Date.now() - signedInAt > 10 * 60 * 1000) {
    throw new HttpsError("failed-precondition", "REAUTH: For safety, sign out and sign in again, then delete within 10 minutes.");
  }
  const db = getFirestore();
  const bucket = getStorage().bucket();

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

  const userSnap = await db.collection("users").doc(uid).get();
  const enrollmentNumber = userSnap.data()?.enrollmentNumber as string | undefined;

  const deleteLeaves = async () => {
    try {
      const snap = await db.collection("leaveApplications").where("studentUid", "==", uid).get();
      for (const d of snap.docs) {
        await db.recursiveDelete(d.ref);
        await db.collection("medicalExcusals").doc(d.id).delete().catch(() => undefined);
      }
      return snap.size;
    } catch (e) {
      console.error("[deleteMyAccount] leaveApplications:", e);
      return 0;
    }
  };

  const counts = {
    leaves: await deleteLeaves(),
    sos: await deleteWhere("sosAlerts", "studentUid"),
    examRegistrations: await deleteWhere("examRegistrations", "studentUid"),
    excusals: await deleteWhere("eventExcusals", "submittedBy"),
    lostFound: await deleteWhere("lostFoundItems", "postedBy"),
    lostFoundContacts: (await deleteWhere("lostFoundContacts", "contactedByUid")) + (await deleteWhere("lostFoundContacts", "posterUid")),
    counselling: await deleteWhere("counsellingRequests", "studentUid"),
    complaints: await deleteWhere("complaints", "studentUid"),
  };
  await bucket.deleteFiles({prefix: `lostFound/${uid}/`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `profilePhotos/${uid}`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `medicalReports/${uid}/`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `posterScans/${uid}/`}).catch(() => undefined);

  if (enrollmentNumber) {
    const claimRef = db.collection("enrollmentClaims").doc(enrollmentNumber);
    const claim = await claimRef.get();
    if (claim.exists && claim.data()?.uid === uid) await claimRef.delete();
  }

  await db.recursiveDelete(db.collection("users").doc(uid));

  await getAuth().deleteUser(uid);
  console.log(`[deleteMyAccount] deleted ${uid}`, counts);
  return {ok: true};
});
