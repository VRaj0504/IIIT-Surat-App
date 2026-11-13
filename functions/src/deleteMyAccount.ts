import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
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

  // Kept on purpose (college records, matched by enrollment number or student uid):
  // marks, grades, attendance, roster, leave and medical leave records with their documents,
  // event excusals and exam registrations. They affect attendance and results, so the college keeps them.

  const counts = {
    sos: await deleteWhere("sosAlerts", "studentUid"),
    lostFound: await deleteWhere("lostFoundItems", "postedBy"),
    lostFoundContacts: (await deleteWhere("lostFoundContacts", "contactedByUid")) + (await deleteWhere("lostFoundContacts", "posterUid")),
    counselling: await deleteWhere("counsellingRequests", "studentUid"),
    complaints: await deleteWhere("complaints", "studentUid"),
  };
  // Newer features: report/block and the CollegeGo Prep website.
  const delDoc = (path: string) => db.doc(path).delete().catch((e) => console.error(`[deleteMyAccount] ${path}:`, e));
  await Promise.all([
    delDoc(`userBlocks/${uid}`),
    delDoc(`prepProgress/${uid}`),
    delDoc(`prepNotes/${uid}`),
    delDoc(`prepSettings/${uid}`),
    delDoc(`prepProfiles/${uid}`),
    delDoc(`prepContributors/${uid}`),
  ]);
  const prep = {
    reports: await deleteWhere("contentReports", "reporterUid"),
    submissions: await deleteWhere("prepSubmissions", "uid"),
    credited: 0,
    groups: 0,
  };
  // Approved questions stay for other students, but no longer carry this person's name.
  try {
    const qs = await db.collection("prepQuestions").where("contributorUid", "==", uid).get();
    for (const d of qs.docs) await d.ref.update({contributorUid: FieldValue.delete(), contributorName: ""});
    prep.credited = qs.size;
  } catch (e) {
    console.error("[deleteMyAccount] prepQuestions:", e);
  }
  // Leave every study group; a group with nobody left is deleted.
  try {
    const gs = await db.collection("prepGroups").where(`members.${uid}`, "!=", null).get();
    for (const g of gs.docs) {
      const left = Object.keys((g.get("members") ?? {}) as Record<string, unknown>).filter((m) => m !== uid);
      if (left.length === 0) await g.ref.delete();
      else await g.ref.update({[`members.${uid}`]: FieldValue.delete(), ...(g.get("ownerUid") === uid ? {ownerUid: left[0]} : {})});
    }
    prep.groups = gs.size;
  } catch (e) {
    console.error("[deleteMyAccount] prepGroups:", e);
  }

  await bucket.deleteFiles({prefix: `lostFound/${uid}/`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `profilePhotos/${uid}`}).catch(() => undefined);
  await bucket.deleteFiles({prefix: `posterScans/${uid}/`}).catch(() => undefined);

  if (enrollmentNumber) {
    const claimRef = db.collection("enrollmentClaims").doc(enrollmentNumber);
    const claim = await claimRef.get();
    if (claim.exists && claim.data()?.uid === uid) await claimRef.delete();
  }

  await db.recursiveDelete(db.collection("users").doc(uid));

  await getAuth().deleteUser(uid);
  console.log(`[deleteMyAccount] deleted ${uid}`, counts, prep);
  return {ok: true};
});
