import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "./firestore";
import { functions } from "./functionsClient";

// Firestore's onSnapshot fires an "Uncaught Error in snapshot listener"
// with just a generic "Missing or insufficient permissions" message when no
// error callback is passed — which tells you nothing about WHICH listener
// failed. Every subscribeTo* below passes this as the third arg so the
// console instead prints exactly which collection/query choked, which is
// the difference between a two-second fix and guessing across 10 listeners.
function logListenerError(label: string) {
  return (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[messService:${label}] listener error:`, err);
  };
}
import { toMinutes, fromMinutes } from "../utils/breakWindow";
import {
  STORE_OPEN,
  STORE_CLOSE,
  PREP_LEAD_MINUTES,
  getMessOrderingStatus,
} from "../utils/messHours";

// ---------- Pickup slots ----------
// Spreads pickup across the break instead of everyone converging the
// instant the break starts. Purely a scheduling aid, not a hard cap tied
// to food/stock — once every slot is at capacity, new orders just land in
// the last slot rather than being blocked (nobody should be told "you
// can't eat" because of a scheduling quirk).
// Tune these to your actual counter's throughput — this is a guess.
const SLOT_MINUTES = 10;
const SLOT_CAPACITY = 15; // orders per 10-min slot before it's "full"
const SLOT_COUNTERS_COLLECTION = "messSlotCounters";
// How many upcoming slots we're willing to check for room before giving up
// and soft-overflowing into the last one checked. This used to scan every
// slot for the rest of the 9-5 day (~48 reads inside the order transaction
// — real cost and latency under crowd load, for zero benefit since nobody
// picks a slot 6 hours out). Checking a handful of slots starting from
// *now* gets the same "spread the crowd" effect for a fraction of the
// reads. Raise this if SLOT_CAPACITY is regularly maxed out this many
// slots in a row.
const SLOT_LOOKAHEAD = 6;

// Rough serving pace for the "X orders ahead, ~Y min" estimate on the token
// screen. This is a guess — watch the actual counter for a day or two and
// adjust to match reality.
const AVG_SECONDS_PER_ORDER = 90;

export function estimateWaitMinutes(ordersAhead: number): number {
  return Math.max(0, Math.round((ordersAhead * AVG_SECONDS_PER_ORDER) / 60));
}

// ---------- Types ----------

export type MessCategory = "Thali" | "Snacks" | "Beverages";

export type MessMenuItem = {
  id: string;
  name: string;
  category: MessCategory;
  price: number;
  available: boolean;
  // Daily stock tracking. Both null = unlimited/not stock-tracked (old items
  // seeded before this feature keep working exactly as before). Once staff
  // sets a dailyQty each morning, remainingQty counts down as orders are
  // placed and the item auto-flips to unavailable at 0.
  dailyQty: number | null;
  remainingQty: number | null;
  // Permanently retired items (discontinued dishes). Distinct from
  // `available`, which daily stock toggles on/off — archiving is a separate,
  // sticky flag so a discontinued item doesn't reappear the next time
  // someone sets a daily quantity on it. Old items predate this field, so
  // treat undefined the same as false everywhere it's read.
  archived?: boolean;
};

export type CartLine = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

export type OrderStatus = "pending" | "ready" | "served" | "cancelled";
export type PaymentStatus = "unpaid" | "paid";

export type MessOrder = {
  id: string;
  uid: string;
  studentName: string;
  items: CartLine[];
  totalAmount: number;
  tokenNumber: string; // e.g. "A-014" — resets daily
  pickupSlot: string | null; // "H:MM" — which slot of the break to collect in
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentConfirmedBy: string | null;
  createdAt: Timestamp | null;
  readyAt: Timestamp | null;
  readyBy: string | null;
  servedAt: Timestamp | null;
  servedBy: string | null;
  cancelledAt: Timestamp | null;
  cancelledBy: string | null; // uid of whoever cancelled (student or staff)
  cancelReason: string | null;
};

// TODO: replace with the canteen's real UPI ID and display name once you
// have the physical QR.
export const MESS_UPI_VPA = "canteen@placeholder";
export const MESS_UPI_PAYEE_NAME = "IIIT Surat Canteen";

// Builds a UPI deep link pre-filled with a wallet top-up amount, so opening
// it in any UPI app (GPay, PhonePe, Paytm...) takes the student straight to
// a ready-to-pay screen for their recharge. Orders themselves no longer go
// through UPI directly — they're paid out of the wallet balance this tops
// up, which is what lets placeOrder() verify and deduct payment atomically
// instead of trusting a staff member to notice and confirm each payment.
export function buildUpiRechargeUrl(amount: number): string {
  const params = new URLSearchParams({
    pa: MESS_UPI_VPA,
    pn: MESS_UPI_PAYEE_NAME,
    am: amount.toFixed(2),
    cu: "INR",
    tn: "Mess wallet recharge",
  });
  return `upi://pay?${params.toString()}`;
}

export type WalletTxnType = "credit" | "debit";
export type WalletTxnStatus = "pending" | "approved" | "rejected";
// "recharge" = student topped up via UPI, staff verifies the reference.
// "refund" = student self-cancelled a pending order; staff verifies there's
// nothing fishy (e.g. repeated cancel-after-prep abuse) before crediting it
// back, same as a recharge. Old docs have no `source` and are treated as
// "recharge" everywhere this is read.
export type WalletTxnSource = "recharge" | "refund";

export type WalletTransaction = {
  id: string;
  uid: string;
  studentName: string;
  type: WalletTxnType;
  amount: number;
  reason: string;
  upiRefId: string | null;
  status: WalletTxnStatus;
  source: WalletTxnSource;
  orderId: string | null; // set for refund txns — which order this refunds
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
};

const MENU_ITEMS_COLLECTION = "messMenuItems";
const ORDERS_COLLECTION = "messOrders";
const WALLETS_COLLECTION = "wallets";
const WALLET_TXNS_COLLECTION = "walletTransactions";
// One doc per UPI reference ID ever submitted, keyed by the reference
// itself. Its only job is to make that reference un-submittable a second
// time — see requestRecharge() below — so the same real-world payment
// can't be used to claim two separate wallet credits (by mistake or by a
// student re-submitting after rejection with a friend's leftover ref, or
// by two students racing to submit the same screenshot's reference).
const WALLET_TXN_REFS_COLLECTION = "walletTxnRefs";
const TOKEN_COUNTER_DOC = "counters/messToken";

// ---------- Menu ----------

export function subscribeToMenuItems(
  callback: (items: MessMenuItem[]) => void,
) {
  const q = query(
    collection(db, MENU_ITEMS_COLLECTION),
    where("available", "==", true),
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as MessMenuItem,
    );
    items.sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
    callback(items);
  }, logListenerError("subscribeToMenuItems"));
}

// Unfiltered — includes sold-out/unavailable items too. For the staff stock
// screen, which needs to set tomorrow's quantity on an item that's currently
// showing 0 remaining.
export function subscribeToAllMenuItems(
  callback: (items: MessMenuItem[]) => void,
) {
  return onSnapshot(collection(db, MENU_ITEMS_COLLECTION), (snap) => {
    const items = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as MessMenuItem,
    );
    items.sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
    callback(items);
  }, logListenerError("subscribeToAllMenuItems"));
}

// Adds a brand-new item to the menu (e.g. a new snack the mess starts
// serving). Starts with no stock cap — staff sets a dailyQty from the
// Stock tab once they know how many they're prepping, same as any other
// item.
export async function addMenuItem(
  name: string,
  category: MessCategory,
  price: number,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter an item name.");
  if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid price.");
  const ref = await addDoc(collection(db, MENU_ITEMS_COLLECTION), {
    name: trimmed,
    category,
    price: Math.round(price),
    available: true,
    dailyQty: null,
    remainingQty: null,
  });
  return ref.id;
}

// Edits an existing item's name/category/price. Doesn't touch
// stock/availability — use setDailyQuantity/clearDailyQuantity for that,
// so a staffer correcting a typo in the name can't accidentally reset
// today's remaining count.
export async function updateMenuItem(
  itemId: string,
  updates: { name?: string; category?: MessCategory; price?: number },
): Promise<void> {
  const patch: Record<string, string | number> = {};
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new Error("Enter an item name.");
    patch.name = trimmed;
  }
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.price !== undefined) {
    if (!Number.isFinite(updates.price) || updates.price < 0) {
      throw new Error("Enter a valid price.");
    }
    patch.price = Math.round(updates.price);
  }
  if (Object.keys(patch).length === 0) return;
  await setDoc(doc(db, MENU_ITEMS_COLLECTION, itemId), patch, { merge: true });
}

// Permanently removes an item from the menu. Past orders keep their own
// copy of the name/price (CartLine snapshots them at order time), so
// deleting an item here never rewrites order history — it just stops the
// item from being orderable going forward. For a "we're out of this for
// good today but might bring it back tomorrow" pause, prefer
// setDailyQuantity(id, 0) instead, which keeps the item around at zero
// stock rather than deleting it.
export async function deleteMenuItem(itemId: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, MENU_ITEMS_COLLECTION, itemId));
}

// Staff sets how many of an item are available today. Called once each
// morning per item (or whenever they want to top it up / zero it out).
// Setting dailyQty resets remainingQty to match — this is a deliberate
// reset, not a top-up, so staff always know exactly what's live right now.
export async function setDailyQuantity(
  itemId: string,
  dailyQty: number,
): Promise<void> {
  const qty = Math.max(0, Math.floor(dailyQty));
  await setDoc(
    doc(db, MENU_ITEMS_COLLECTION, itemId),
    { dailyQty: qty, remainingQty: qty, available: qty > 0 },
    { merge: true },
  );
}

// Removes stock tracking for an item entirely (back to "always available"
// like before this feature existed).
export async function clearDailyQuantity(itemId: string): Promise<void> {
  await setDoc(
    doc(db, MENU_ITEMS_COLLECTION, itemId),
    { dailyQty: null, remainingQty: null, available: true },
    { merge: true },
  );
}

// ---------- Wallet (currently unused by the ordering flow — kept in case
// you still want recharge-based accounts for something else) ----------

export function subscribeToWalletBalance(
  uid: string,
  callback: (balance: number) => void,
) {
  return onSnapshot(
    doc(db, WALLETS_COLLECTION, uid),
    (snap) => {
      callback(snap.exists() ? (snap.data().balance as number) : 0);
    },
    logListenerError("subscribeToWalletBalance"),
  );
}

export function subscribeToMyTransactions(
  uid: string,
  callback: (txns: WalletTransaction[]) => void,
) {
  const q = query(
    collection(db, WALLET_TXNS_COLLECTION),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction),
      );
    },
    logListenerError("subscribeToMyTransactions"),
  );
}

const createRechargeOrderCallable = httpsCallable<
  { amount: number },
  { orderId: string; amount: number; currency: string; keyId: string }
>(functions, "createRechargeOrder");

// Creates a real Razorpay order for a wallet top-up — the Checkout screen
// (RechargeCheckoutScreen.tsx) opens Razorpay's payment UI using what
// this returns. The wallet itself gets credited later, automatically, by
// razorpayWebhook once the payment actually completes — nothing here
// touches the wallet balance directly.
export async function createRazorpayRechargeOrder(amount: number) {
  const result = await createRechargeOrderCallable({amount});
  return result.data;
}

export async function requestRecharge(
  uid: string,
  studentName: string,
  amount: number,
  upiRefId: string,
): Promise<void> {
  const ref = upiRefId.trim();
  if (!ref) {
    throw new Error("Enter the UPI transaction ID from your payment.");
  }
  const refDocRef = doc(db, WALLET_TXN_REFS_COLLECTION, ref);
  const txnRef = doc(collection(db, WALLET_TXNS_COLLECTION));

  await runTransaction(db, async (tx) => {
    const refSnap = await tx.get(refDocRef);
    if (refSnap.exists()) {
      throw new Error(
        "This UPI reference has already been submitted for a recharge — each payment can only be claimed once.",
      );
    }
    tx.set(refDocRef, { uid, txnId: txnRef.id, createdAt: serverTimestamp() });
    tx.set(txnRef, {
      uid,
      studentName,
      type: "credit",
      amount,
      reason: "Wallet recharge",
      upiRefId: ref,
      status: "pending",
      source: "recharge",
      orderId: null,
      createdAt: serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
    });
  });
}

export function subscribeToPendingRecharges(
  callback: (txns: WalletTransaction[]) => void,
) {
  const q = query(
    collection(db, WALLET_TXNS_COLLECTION),
    where("status", "==", "pending"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction),
      );
    },
    logListenerError("subscribeToPendingRecharges"),
  );
}

export async function approveRecharge(
  txnId: string,
  staffUid: string,
): Promise<void> {
  const txnRef = doc(db, WALLET_TXNS_COLLECTION, txnId);
  await runTransaction(db, async (tx) => {
    const txnSnap = await tx.get(txnRef);
    if (!txnSnap.exists()) throw new Error("Request not found.");
    const txn = txnSnap.data() as WalletTransaction;
    if (txn.status !== "pending") throw new Error("Already resolved.");

    const walletRef = doc(db, WALLETS_COLLECTION, txn.uid);
    const walletSnap = await tx.get(walletRef);
    const currentBalance = walletSnap.exists()
      ? (walletSnap.data().balance as number)
      : 0;

    tx.set(
      walletRef,
      { balance: currentBalance + txn.amount, updatedAt: serverTimestamp() },
      { merge: true },
    );
    tx.update(txnRef, {
      status: "approved",
      resolvedAt: serverTimestamp(),
      resolvedBy: staffUid,
    });
  });
}

export async function rejectRecharge(
  txnId: string,
  staffUid: string,
): Promise<void> {
  const txnRef = doc(db, WALLET_TXNS_COLLECTION, txnId);
  await runTransaction(db, async (tx) => {
    const txnSnap = await tx.get(txnRef);
    if (!txnSnap.exists()) throw new Error("Request not found.");
    if ((txnSnap.data() as WalletTransaction).status !== "pending")
      throw new Error("Already resolved.");
    tx.update(txnRef, {
      status: "rejected",
      resolvedAt: serverTimestamp(),
      resolvedBy: staffUid,
    });
  });
}

// ---------- Orders / Tokens ----------
//
// todayKey/upcomingSlots (and the TOKEN_COUNTER_DOC/SLOT_COUNTERS_COLLECTION
// constants above) were only used by the old client-side placeOrder()
// transaction. Now that placeOrder() calls placeOrderFn instead, the token
// counter and slot-spreading logic live server-side in
// functions/src/messHours.ts + functions/src/placeOrder.ts. Left here
// unused rather than deleted, same as breakWindow.ts's older
// getOrderingWindowStatus — nothing currently calls these.

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// The next SLOT_LOOKAHEAD slots from right now (or from store-open if we're
// asked before opening), as "H:MM" strings. Used purely to spread the
// "ready around ~X" estimate shown to the student — it's no longer tied to
// a per-section timetable break, and it no longer scans the whole day (see
// SLOT_LOOKAHEAD's comment above): only the handful of slots anyone could
// plausibly land in next actually needs checking.
function upcomingSlots(now: Date): string[] {
  const open = toMinutes(STORE_OPEN);
  const close = toMinutes(STORE_CLOSE);
  const nowMinutes = Math.max(open, now.getHours() * 60 + now.getMinutes());
  // Snap to the current/next slot boundary so slots line up consistently
  // across requests instead of drifting with each caller's exact second.
  const start = nowMinutes - (nowMinutes % SLOT_MINUTES);
  const slots: string[] = [];
  for (
    let t = start;
    t < close && slots.length < SLOT_LOOKAHEAD;
    t += SLOT_MINUTES
  ) {
    slots.push(fromMinutes(t));
  }
  // Falls back to the single last slot of the day if we're called right at
  // closing time and the loop above produces nothing.
  if (slots.length === 0) slots.push(fromMinutes(close - SLOT_MINUTES));
  return slots;
}

// Generates a one-off id per order ATTEMPT (not per order) — this is what
// lets placeOrderFn tell "the same tap retried" apart from "a new order",
// see requestId in functions/src/placeOrder.ts. Doesn't need to be
// cryptographically unpredictable, just unique in practice: Hermes/React
// Native don't reliably expose crypto.randomUUID(), so this rolls its own
// rather than adding a dependency for one random string.
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const placeOrderCallable = httpsCallable<
  { cart: { itemId: string; qty: number }[]; requestId: string; studentName: string },
  { orderId: string; tokenNumber: string; pickupSlot: string | null }
>(functions, "placeOrderFn");

// Places an order and pays for it out of the student's wallet, via the
// placeOrderFn Cloud Function (functions/src/placeOrder.ts) rather than a
// client-side Firestore transaction. The function reads real prices from
// messMenuItems server-side and does the order-window check, stock
// check + decrement, wallet balance check + debit, token number, and order
// creation all inside one Firestore transaction on its end — so the
// client's cart can only ever say WHAT to order, never what it costs, and
// two students tapping "order" on the last plate/last rupee at the same
// instant still can't both succeed.
export async function placeOrder(
  uid: string,
  studentName: string,
  cart: CartLine[],
): Promise<{ orderId: string; tokenNumber: string; pickupSlot: string | null }> {
  // Re-check the store window client-side before calling the function —
  // not strictly necessary (the function checks too) but gives a faster,
  // clearer error than a round trip for something obviously closed.
  const windowStatus = getMessOrderingStatus(new Date());
  if (windowStatus.state !== "open") {
    throw new Error(
      windowStatus.state === "before_open"
        ? `The mess opens at ${STORE_OPEN}.`
        : `Ordering's closed for today — last orders are taken ${PREP_LEAD_MINUTES} min before ${STORE_CLOSE}.`,
    );
  }

  try {
    const result = await placeOrderCallable({
      cart: cart.map((line) => ({ itemId: line.itemId, qty: line.qty })),
      requestId: generateRequestId(),
      studentName,
    });
    return result.data;
  } catch (err: any) {
    // httpsCallable wraps server-thrown HttpsError messages in err.message
    // already in human-readable form (see the strings placeOrderFn throws)
    // — just surface that directly rather than a generic "call failed".
    throw new Error(err?.message ?? "Could not place order. Please try again.");
  }
}

export function subscribeToOrder(
  orderId: string,
  callback: (order: MessOrder | null) => void,
) {
  return onSnapshot(
    doc(db, ORDERS_COLLECTION, orderId),
    (snap) => {
      callback(
        snap.exists() ? ({ id: snap.id, ...snap.data() } as MessOrder) : null,
      );
    },
    logListenerError("subscribeToOrder"),
  );
}

export function subscribeToMyActiveOrders(
  uid: string,
  callback: (orders: MessOrder[]) => void,
) {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("uid", "==", uid),
    where("status", "in", ["pending", "ready"]),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessOrder));
    },
    logListenerError("subscribeToMyActiveOrders"),
  );
}

// Every order the student has ever placed (any status), most recent first,
// for the order-history / reorder screen. Capped at 30 — this is a "what
// did I get last week" list, not a full statement.
export function subscribeToMyOrderHistory(
  uid: string,
  callback: (orders: MessOrder[]) => void,
) {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(30),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessOrder));
    },
    logListenerError("subscribeToMyOrderHistory"),
  );
}

// Student cancels their own order. Only allowed while it's still "pending"
// — once the kitchen has marked it "ready" the food is already made, so
// from that point on only staff can cancel (see staffCancelOrder below).
//
// This does NOT credit the wallet directly — a student writing their own
// wallet balance up is exactly the hole the security rules close (see
// firestore.rules on `wallets`). Instead it files a refund request through
// the same pending-then-staff-approved path as a UPI recharge
// (requestRecharge/approveRecharge), reusing rules and code that are
// already trusted with real money rather than opening a new one. The
// walletTxnRefs doc, keyed by the order id, is what stops the same order
// from being "cancelled" twice to double-claim a refund — plus the order's
// own status guard below refuses a second cancel outright either way.
export async function cancelOrder(
  orderId: string,
  uid: string,
  studentName: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  const refDocRef = doc(db, WALLET_TXN_REFS_COLLECTION, `REFUND-${orderId}`);
  const txnRef = doc(collection(db, WALLET_TXNS_COLLECTION));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data() as MessOrder;
    if (order.uid !== uid) throw new Error("This isn't your order.");
    if (order.status !== "pending") {
      throw new Error(
        order.status === "ready"
          ? "This order is already being prepared — ask mess staff to cancel it at the counter."
          : "This order can no longer be cancelled.",
      );
    }
    const refSnap = await tx.get(refDocRef);
    if (refSnap.exists()) {
      throw new Error("This order has already been cancelled.");
    }

    // Firestore transactions require every read to happen before any
    // write, so gather all the item snapshots first, then write them all.
    const itemRefsForOrder = order.items.map((line) =>
      doc(db, MENU_ITEMS_COLLECTION, line.itemId),
    );
    const itemSnaps = await Promise.all(
      itemRefsForOrder.map((ref) => tx.get(ref)),
    );

    // Restore stock for tracked items so the plates/cups go back on sale.
    itemSnaps.forEach((itemSnap, i) => {
      if (itemSnap.exists()) {
        const remaining = itemSnap.data().remainingQty;
        if (typeof remaining === "number") {
          const next = remaining + order.items[i].qty;
          tx.update(itemRefsForOrder[i], { remainingQty: next, available: next > 0 });
        }
      }
    });

    tx.update(orderRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: uid,
      cancelReason: "Cancelled by student",
    });

    tx.set(refDocRef, {
      uid,
      txnId: txnRef.id,
      createdAt: serverTimestamp(),
    });
    tx.set(txnRef, {
      uid,
      studentName,
      type: "credit",
      amount: order.totalAmount,
      reason: `Refund — order ${order.tokenNumber} cancelled`,
      upiRefId: `REFUND-${orderId}`,
      status: "pending",
      source: "refund",
      orderId,
      createdAt: serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
    });
  });
}

// Staff cancels an order (typically a no-show) and refunds it immediately
// — unlike the student path above, staff already has unrestricted write
// access to both messOrders and wallets (see firestore.rules), so this can
// safely do the refund in the same atomic transaction instead of filing a
// request staff would just have to approve themselves a moment later.
// Works for "pending" or "ready" orders; "served"/"cancelled" orders are
// done and can't be reopened.
export async function staffCancelOrder(
  orderId: string,
  staffUid: string,
  reason: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  const txnRef = doc(collection(db, WALLET_TXNS_COLLECTION));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data() as MessOrder;
    if (order.status === "served") throw new Error("Already served — can't cancel a completed order.");
    if (order.status === "cancelled") throw new Error("Already cancelled.");

    const walletDocRef = doc(db, WALLETS_COLLECTION, order.uid);
    const walletSnap = await tx.get(walletDocRef);
    const currentBalance = walletSnap.exists()
      ? (walletSnap.data()!.balance as number)
      : 0;

    // Firestore transactions require every read to happen before any
    // write, so gather all the item snapshots first, then write them all.
    const itemRefsForOrder = order.items.map((line) =>
      doc(db, MENU_ITEMS_COLLECTION, line.itemId),
    );
    const itemSnaps = await Promise.all(
      itemRefsForOrder.map((ref) => tx.get(ref)),
    );

    // Restore stock for tracked items.
    itemSnaps.forEach((itemSnap, i) => {
      if (itemSnap.exists()) {
        const remaining = itemSnap.data().remainingQty;
        if (typeof remaining === "number") {
          const next = remaining + order.items[i].qty;
          tx.update(itemRefsForOrder[i], { remainingQty: next, available: next > 0 });
        }
      }
    });

    tx.set(
      walletDocRef,
      { balance: currentBalance + order.totalAmount, updatedAt: serverTimestamp() },
      { merge: true },
    );

    tx.update(orderRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: staffUid,
      cancelReason: reason || "Cancelled by mess staff",
    });

    // Log it in wallet history too, already resolved — staff doing the
    // cancel IS the approval, no separate step needed.
    tx.set(txnRef, {
      uid: order.uid,
      studentName: order.studentName,
      type: "credit",
      amount: order.totalAmount,
      reason: `Refund — order ${order.tokenNumber} cancelled by mess staff`,
      upiRefId: null,
      status: "approved",
      source: "refund",
      orderId,
      createdAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
      resolvedBy: staffUid,
    });
  });
}

export function subscribeToQueue(callback: (orders: MessOrder[]) => void) {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("status", "in", ["pending", "ready"]),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessOrder));
    },
    logListenerError("subscribeToQueue"),
  );
}

export async function findOrderByToken(
  tokenNumber: string,
): Promise<MessOrder | null> {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("tokenNumber", "==", tokenNumber.trim().toUpperCase()),
    where("status", "in", ["pending", "ready"]),
    limit(1),
  );
  const { getDocs } = await import("firebase/firestore");
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as MessOrder;
}

export async function getOrderById(orderId: string): Promise<MessOrder | null> {
  const snap = await getDoc(doc(db, ORDERS_COLLECTION, orderId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as MessOrder) : null;
}

// Cook/counter flags an order as plated and ready to hand over. This is
// independent of payment — kitchen prep doesn't need to wait on payment
// confirmation, and staff can run both in parallel instead of the student
// standing at the counter while everything gets checked in sequence.
//
// Doesn't require payment to be confirmed first: the point is to let the
// kitchen work ahead of the counter, not to gate cooking on money.
export async function markOrderReady(
  orderId: string,
  staffUid: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data() as MessOrder;
    if (order.status === "served") throw new Error("Already served.");
    if (order.status === "ready") throw new Error("Already marked ready.");
    tx.update(orderRef, {
      status: "ready",
      readyAt: serverTimestamp(),
      readyBy: staffUid,
    });
  });
}

// ---------- Feedback ----------

export type MessFeedback = {
  id: string;
  orderId: string;
  uid: string;
  itemId: string;
  itemName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: Timestamp | null;
};

const FEEDBACK_COLLECTION = "messFeedback";

// One feedback doc per (order, item) — called once per item after an order
// is served. Doc id is deterministic (`${orderId}_${itemId}`) so a second
// submission overwrites rather than duplicating, and so the client can
// check "have I already rated this" without a query.
export async function submitFeedback(
  uid: string,
  orderId: string,
  itemId: string,
  itemName: string,
  rating: 1 | 2 | 3 | 4 | 5,
  comment: string,
): Promise<void> {
  const feedbackRef = doc(db, FEEDBACK_COLLECTION, `${orderId}_${itemId}`);
  await setDoc(feedbackRef, {
    orderId,
    uid,
    itemId,
    itemName,
    rating,
    comment: comment.trim() || null,
    createdAt: serverTimestamp(),
  });
}

// Needs a `uid` filter alongside `orderId`, not just orderId alone: the
// messFeedback security rule can only verify "resource.data.uid ==
// request.auth.uid" (it has no way to check orderId ownership without an
// extra read), and Firestore rejects a whole list query up front —
// "Missing or insufficient permissions", even though every matching doc
// really would belong to this student — unless the query's own filters
// already guarantee that per the rule. Filtering on uid here is what makes
// the query provably safe to the rules engine, not just correct in practice.
export function subscribeToFeedbackForOrder(
  orderId: string,
  uid: string,
  callback: (feedback: MessFeedback[]) => void,
) {
  const q = query(
    collection(db, FEEDBACK_COLLECTION),
    where("orderId", "==", orderId),
    where("uid", "==", uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessFeedback));
    },
    logListenerError("subscribeToFeedbackForOrder"),
  );
}

// ---------- Analytics (staff) ----------
// Client-side aggregation over served orders in a date range. Fine at
// current volume (a college mess counter, not a chain) — if this ever
// scans thousands of orders per query, move it to a scheduled Cloud
// Function that writes a precomputed daily/monthly summary doc instead.

export type ItemStat = { itemId: string; name: string; qty: number; revenue: number };
export type MonthlyMessStats = {
  totalOrders: number;
  totalRevenue: number;
  itemStats: ItemStat[]; // sorted most-ordered first
  avgRating: number | null;
  ratingCount: number;
};

export async function getMonthlyMessStats(
  year: number,
  month: number, // 1-12
): Promise<MonthlyMessStats> {
  const { getDocs, Timestamp: FsTimestamp } = await import("firebase/firestore");
  const start = FsTimestamp.fromDate(new Date(year, month - 1, 1));
  const end = FsTimestamp.fromDate(new Date(year, month, 1));

  const ordersQ = query(
    collection(db, ORDERS_COLLECTION),
    where("status", "==", "served"),
    where("createdAt", ">=", start),
    where("createdAt", "<", end),
  );
  const ordersSnap = await getDocs(ordersQ);

  const itemMap = new Map<string, ItemStat>();
  let totalRevenue = 0;
  ordersSnap.docs.forEach((d) => {
    const order = d.data() as MessOrder;
    totalRevenue += order.totalAmount;
    order.items.forEach((line) => {
      const existing = itemMap.get(line.itemId);
      if (existing) {
        existing.qty += line.qty;
        existing.revenue += line.price * line.qty;
      } else {
        itemMap.set(line.itemId, {
          itemId: line.itemId,
          name: line.name,
          qty: line.qty,
          revenue: line.price * line.qty,
        });
      }
    });
  });

  const feedbackQ = query(
    collection(db, FEEDBACK_COLLECTION),
    where("createdAt", ">=", start),
    where("createdAt", "<", end),
  );
  const feedbackSnap = await getDocs(feedbackQ);
  const ratings = feedbackSnap.docs.map((d) => (d.data() as MessFeedback).rating);
  const ratingCount = ratings.length;
  const avgRating =
    ratingCount > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratingCount
      : null;

  return {
    totalOrders: ordersSnap.size,
    totalRevenue,
    itemStats: Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty),
    avgRating,
    ratingCount,
  };
}

export async function markOrderServed(
  orderId: string,
  staffUid: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data() as MessOrder;
    if (order.status === "served") throw new Error("Already served.");
    if (order.paymentStatus !== "paid")
      throw new Error("Payment not confirmed yet — confirm payment first.");
    tx.update(orderRef, {
      status: "served",
      servedAt: serverTimestamp(),
      servedBy: staffUid,
    });
  });
}