import {onRequest} from "firebase-functions/v2/https";
import * as crypto from "crypto";
import * as admin from "firebase-admin";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

const razorpaySecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");

// Idempotency here relies on the processedPayments/{payment.id} check and
// write happening INSIDE the same Firestore transaction as the wallet
// credit: if Razorpay fires two overlapping retries for the same payment
// (it does retry on anything but a fast 2xx), Firestore serializes the two
// transactions on that one document — the second one re-runs, sees the doc
// now exists, and no-ops instead of crediting the wallet twice.
export const razorpayWebhook = onRequest(
  {
    secrets: [razorpaySecret],
    region: "asia-south1",
    // Webhook calls are infrequent relative to placeOrderFn (one per
    // recharge, not one per order), but still I/O-bound — a modest
    // concurrency/instance cap keeps this cheap without needing to scale
    // anywhere near placeOrderFn's ceiling.
    concurrency: 40,
    maxInstances: 5,
  },
  async (req, res) => {
    const signature = req.headers["x-razorpay-signature"] as string;
    const expected = crypto
      .createHmac("sha256", razorpaySecret.value())
      .update(req.rawBody)
      .digest("hex");
    if (signature !== expected) {
      res.status(400).send("bad signature");
      return;
    }

    const event = req.body;
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      // Tagged when the Razorpay order is created, with the student's uid.
      const uid = payment.notes?.uid;
      const amount = payment.amount / 100; // paise -> rupees
      const db = admin.firestore();

      // Without this guard, a payment that somehow reached Razorpay
      // without a uid tag (a bug elsewhere, or a malformed/replayed
      // request) would throw on `db.collection("wallets").doc(uid)`
      // *before* processedPayments gets written — so Razorpay retries it
      // forever, every retry failing the same way. Recording it as a flagged
      // alert instead lets this webhook return 200 (stop-retry) while
      // leaving a clear trail for staff to credit the wallet manually.
      if (!uid || typeof uid !== "string") {
        logger.error("razorpayWebhook: payment.captured with no uid", {
          paymentId: payment?.id,
          amount,
        });
        await db.collection("paymentAlerts").doc(payment.id).set({
          reason: "missing uid on payment.notes",
          amount,
          raw: payment,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send("ok"); // stop Razorpay from retrying forever
        return;
      }

      await db.runTransaction(async (tx) => {
        const eventRef = db.collection("processedPayments").doc(payment.id);
        if ((await tx.get(eventRef)).exists) return; // duplicate webhook
        const walletRef = db.collection("wallets").doc(uid);
        const walletSnap = await tx.get(walletRef);
        const balance = walletSnap.exists ?
          (walletSnap.data()!.balance as number) :
          0;
        tx.set(walletRef, {
          balance: balance + amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(eventRef, {
          uid,
          amount,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection("walletTransactions").doc(), {
          uid,
          type: "credit",
          amount,
          source: "recharge",
          status: "approved",
          reason: "Wallet recharge (Razorpay)",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    }
    res.status(200).send("ok");
  },
);

