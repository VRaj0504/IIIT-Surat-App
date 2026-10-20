import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

// Deletes a DOUBT once it's been sitting resolved for 12+ hours — a
// doubt is a quick, low-stakes academic question, not a record anyone
// needs kept around after it's answered. This deliberately does NOT
// touch anything with type == 'complaint', regardless of status —
// complaints need to stay forever, for the monthly Excel export (see
// the "Download Report" button in the web portal's Complaints tab).
// Also leaves 'rejected'/'dismissed' doubts alone — only ones actually
// marked resolved, matching exactly what was asked; say so if
// dismissed ones should clean up too.
//
// Hourly is granular enough for a 12-hour window — nobody needs their
// resolved doubt to vanish at the exact minute mark.
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
