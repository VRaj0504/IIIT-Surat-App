import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

export const cleanupResolvedDoubts = onSchedule(
  {schedule: "every 60 minutes", region: "asia-south1"},
  async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000);

    const snap = await db
      .collection("complaints")
      .where("type", "==", "doubt")
      .where("status", "==", "resolved")
      .where("resolvedAt", "<=", cutoff)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    logger.info(`cleanupResolvedDoubts: deleted ${snap.size} doubt(s) resolved more than 12h ago`);
  },
);
