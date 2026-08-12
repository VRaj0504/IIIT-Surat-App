import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  getMessOrderingStatus,
  todayKeyIST,
  upcomingSlotsIST,
  SLOT_CAPACITY,
  STORE_OPEN,
  STORE_CLOSE,
  PREP_LEAD_MINUTES,
} from "./messHours";

type CartLineIn = { itemId: string; qty: number };

const TOKEN_SHARDS_COLLECTION = "counters_messTokenShards";
const TOKEN_SHARD_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const TOKEN_SHARD_COUNT = TOKEN_SHARD_LETTERS.length;
const SLOT_COUNTERS_COLLECTION = "messSlotCounters";

// This is now the ONLY way a messOrders doc gets created — see
// firestore.rules, where client-side `create` on messOrders/wallets/the
// counter collections has been removed. That closes the gap the old
// client-side placeOrder() left open: a tampered client could previously
// submit any totalAmount it liked (rules only checked "is a number >= 0").
// Running as a Cloud Function means this reads prices from Firestore
// itself, server-side, so the client's cart can only ever say WHAT to
// order, never what it costs.
//
// Concurrency: this function is stateless (no shared in-memory counters),
// so Cloud Functions can and will run many instances of it in parallel
// under load — throughput here scales the same way it did as a direct
// client transaction: bounded by Firestore's per-document write cap
// (~1/sec), which is why token numbers and pickup-slot counters below are
// each spread across multiple shard documents rather than one.
export const placeOrderFn = onCall(
  {
    region: "asia-south1", // co-located with IIIT Surat users — cuts round-trip latency under load
    // This function is I/O-bound (waiting on Firestore reads/writes, not
    // CPU), so one instance can genuinely serve many concurrent calls at
    // once instead of queuing them behind each other — raising this above
    // the default (80) lets a single warm instance absorb more of the
    // lunch-rush spike before Cloud Functions needs to spin up a new one.
    concurrency: 200,
    // Caps how many instances can exist at once — a safety net against a
    // runaway cost/DDOS scenario, not a realistic ceiling: at ~200
    // concurrent calls/instance, this comfortably covers the entire
    // college ordering at once, several times over. Raise if actual
    // lunch-rush metrics ever get close.
    maxInstances: 20,
    // Keeps 1 instance warm at all times so the very first orders placed
    // the moment the mess opens (or right as a break starts, when demand
    // jumps from ~0 to a spike almost instantly) don't pay a multi-second
    // cold-start penalty on top of the transaction itself.
    minInstances: 1,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const {cart, requestId, studentName} = request.data as {
      cart: CartLineIn[];
      requestId: string;
      studentName: string;
    };
    if (!Array.isArray(cart) || cart.length === 0 || !requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "Bad request.");
    }
    if (cart.length > 30) {
      throw new HttpsError("invalid-argument", "Too many distinct items in one order.");
    }
    for (const line of cart) {
      if (!line.itemId || typeof line.qty !== "number" || line.qty <= 0 || line.qty > 50) {
        throw new HttpsError("invalid-argument", "Bad cart line.");
      }
    }

    const now = new Date();
    const windowStatus = getMessOrderingStatus(now);
    if (windowStatus.state !== "open") {
      throw new HttpsError(
        "failed-precondition",
        windowStatus.state === "before_open" ?
          `The mess opens at ${STORE_OPEN}.` :
          `Ordering's closed for today — last orders are taken ${PREP_LEAD_MINUTES} min before ${STORE_CLOSE}.`,
      );
    }

    const db = admin.firestore();
    const orderRef = db.collection("messOrders").doc();
    // Idempotency: requestId is a client-generated key, one per order
    // attempt (see messService.ts). If the same attempt is retried — flaky
    // network, a double-tap that fires before the button disables, the app
    // backgrounding mid-call — this looks up the SAME requestId doc and
    // returns the original result instead of creating (and charging for) a
    // second order.
    const requestRef = db.collection("orderRequests").doc(requestId);
    const walletRef = db.collection("wallets").doc(uid);
    const itemRefs = cart.map((l) => db.collection("messMenuItems").doc(l.itemId));

    // Same sharding scheme as the counters/messToken doc this replaces:
    // Firestore caps sustained writes to ~1/sec per document, so at lunch
    // rush (hundreds of orders in a few minutes) a single counter doc would
    // queue up or fail transactions behind it. Picking one of 8 shards at
    // random spreads writes across up to 8 docs, multiplying sustained
    // throughput by that factor. Tokens are unique per-shard and reset
    // daily — not globally sequential — which is fine since the staff queue
    // sorts by createdAt, not by token number.
    const shardLetter = TOKEN_SHARD_LETTERS[Math.floor(Math.random() * TOKEN_SHARD_COUNT)];
    const counterRef = db.collection(TOKEN_SHARDS_COLLECTION).doc(shardLetter);

    const today = todayKeyIST(now);
    const slots = upcomingSlotsIST(now);
    const slotCounterRefs = slots.map((slot) =>
      db.collection(SLOT_COUNTERS_COLLECTION).doc(`${today}_${slot}`),
    );

    return db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (requestSnap.exists) {
        const existing = requestSnap.data()!;
        return {
          orderId: existing.orderId,
          tokenNumber: existing.tokenNumber,
          pickupSlot: existing.pickupSlot ?? null,
        };
      }

      // Firestore transactions require all reads before any writes.
      const itemSnaps = await Promise.all(itemRefs.map((r) => tx.get(r)));
      const walletSnap = await tx.get(walletRef);
      const counterSnap = await tx.get(counterRef);
      const slotSnaps = await Promise.all(slotCounterRefs.map((r) => tx.get(r)));

      // Real prices, read server-side — the client never gets to say what
      // anything costs.
      let totalAmount = 0;
      const cartLines: { itemId: string; name: string; price: number; qty: number }[] = [];
      itemSnaps.forEach((snap, i) => {
        const line = cart[i];
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", `${line.itemId} is no longer on the menu.`);
        }
        const data = snap.data()!;
        const remaining = data.remainingQty;
        if (typeof remaining === "number" && remaining < line.qty) {
          throw new HttpsError(
            "failed-precondition",
            remaining === 0 ?
              `${data.name} just sold out — please remove it from your cart.` :
              `Only ${remaining} × ${data.name} left — please lower the quantity.`,
          );
        }
        totalAmount += data.price * line.qty;
        cartLines.push({itemId: line.itemId, name: data.name, price: data.price, qty: line.qty});
      });

      const balance = walletSnap.exists ? (walletSnap.data()!.balance as number) : 0;
      if (balance < totalAmount) {
        throw new HttpsError(
          "failed-precondition",
          `Not enough balance — you have ₹${balance}, this order is ₹${totalAmount}. Recharge your wallet first.`,
        );
      }

      // Decrement stock for tracked items.
      itemSnaps.forEach((snap, i) => {
        const remaining = snap.data()!.remainingQty;
        if (typeof remaining === "number") {
          const next = remaining - cart[i].qty;
          tx.update(itemRefs[i], {remainingQty: next, available: next > 0});
        }
      });

      tx.set(
        walletRef,
        {balance: balance - totalAmount, updatedAt: admin.firestore.FieldValue.serverTimestamp()},
        {merge: true},
      );

      // Token number — daily-reset counter, scoped to this order's shard.
      let count = 1;
      if (counterSnap.exists && counterSnap.data()!.date === today) {
        count = (counterSnap.data()!.count as number) + 1;
      }
      tx.set(counterRef, {date: today, count}, {merge: true});
      const tokenNumber = `${shardLetter}-${String(count).padStart(3, "0")}`;

      // Pickup slot — first slot with room, else soft-overflow into the
      // last one checked (never blocks an order over a scheduling quirk).
      let pickupSlot: string | null = null;
      if (slots.length > 0) {
        let chosenIndex = slots.length - 1;
        for (let i = 0; i < slots.length; i++) {
          const c = slotSnaps[i].exists ? (slotSnaps[i].data()!.count as number) : 0;
          if (c < SLOT_CAPACITY) {
            chosenIndex = i;
            break;
          }
        }
        pickupSlot = slots[chosenIndex];
        const currentCount = slotSnaps[chosenIndex].exists ?
          (slotSnaps[chosenIndex].data()!.count as number) :
          0;
        tx.set(
          slotCounterRefs[chosenIndex],
          {date: today, slot: pickupSlot, count: currentCount + 1},
          {merge: true},
        );
      }

      tx.set(orderRef, {
        uid,
        studentName,
        items: cartLines,
        totalAmount,
        tokenNumber,
        pickupSlot,
        status: "pending",
        paymentStatus: "paid",
        paymentConfirmedBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        readyAt: null,
        readyBy: null,
        servedAt: null,
        servedBy: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
      });
      tx.set(requestRef, {
        uid,
        orderId: orderRef.id,
        tokenNumber,
        pickupSlot,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {orderId: orderRef.id, tokenNumber, pickupSlot};
    });
  },
);
