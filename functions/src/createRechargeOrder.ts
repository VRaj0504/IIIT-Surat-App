import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");

type CreateRechargeOrderRequest = {
  amount: number; // rupees
};

type CreateRechargeOrderResponse = {
  orderId: string;
  amount: number; // paise — what Checkout actually expects
  currency: string;
  keyId: string; // safe to expose client-side; it's the public half of the pair
};

// Creates a real Razorpay order server-side (never trusting a client-sent
// amount for anything financial — same principle placeOrderFn already
// follows for mess orders). The uid tag in `notes` is what lets
// razorpayWebhook credit the correct student's wallet once payment
// actually completes; nothing here credits anything itself.
export const createRechargeOrder = onCall<CreateRechargeOrderRequest, Promise<CreateRechargeOrderResponse>>(
  {
    region: "asia-south1",
    secrets: [razorpayKeyId, razorpayKeySecret],
    // Same reasoning as placeOrderFn — I/O-bound (waiting on Razorpay's
    // API, not local CPU), and a recharge burst (e.g. everyone topping up
    // at semester start) deserves the same headroom as ordering does.
    concurrency: 100,
    maxInstances: 15,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const {amount} = request.data;
    if (!amount || amount <= 0 || amount > 5000) {
      throw new HttpsError("invalid-argument", "Enter an amount between ₹1 and ₹5000.");
    }

    const amountPaise = Math.round(amount * 100);
    const keyId = razorpayKeyId.value();
    const keySecret = razorpayKeySecret.value();
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: {uid},
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpsError("internal", `Razorpay order creation failed: ${errorBody}`);
    }

    const order = (await response.json()) as {id: string; amount: number; currency: string};
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    };
  },
);
