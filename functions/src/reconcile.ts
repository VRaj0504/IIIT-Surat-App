import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

export const dailyReconcile = onSchedule("every day 23:00", async () => {
  const db = admin.firestore();
  const today = new Date().toISOString().slice(0, 10); // "2026-08-11"

  // TODO: once you have Razorpay API keys, replace this with a real call
  // to their Payments API to fetch today's captured payments, sum them,
  // and compare against today's processedPayments docs' sum. For now
  // this just logs that the job ran, so you can confirm the schedule
  // itself is working before wiring up the real comparison.
  await db.collection("reconciliationAlerts").doc(today).set({
    date: today,
    ranAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "placeholder — Razorpay comparison not yet implemented",
  });
});
