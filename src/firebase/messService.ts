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
import { db } from "./firestore";
import { toMinutes, fromMinutes, BreakWindow } from "../utils/breakWindow";

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
};

// TODO: replace with the canteen's real UPI ID and display name once you
// have the physical QR — everything else (amount, note) is generated
// per-order so the canteen can match a payment to an order even though
// it's the same VPA/QR every time.
export const MESS_UPI_VPA = "canteen@placeholder";
export const MESS_UPI_PAYEE_NAME = "IIIT Surat Canteen";

// Builds a UPI deep link pre-filled with this order's exact amount and a
// note containing the token number, so opening it in any UPI app (GPay,
// PhonePe, Paytm...) takes the student straight to a ready-to-pay screen.
export function buildUpiPaymentUrl(order: {
  totalAmount: number;
  tokenNumber: string;
}): string {
  const params = new URLSearchParams({
    pa: MESS_UPI_VPA,
    pn: MESS_UPI_PAYEE_NAME,
    am: order.totalAmount.toFixed(2),
    cu: "INR",
    tn: `Mess order ${order.tokenNumber}`,
  });
  return `upi://pay?${params.toString()}`;
}

export type WalletTxnType = "credit" | "debit";
export type WalletTxnStatus = "pending" | "approved" | "rejected";

export type WalletTransaction = {
  id: string;
  uid: string;
  studentName: string;
  type: WalletTxnType;
  amount: number;
  reason: string;
  upiRefId: string | null;
  status: WalletTxnStatus;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
};

const MENU_ITEMS_COLLECTION = "messMenuItems";
const ORDERS_COLLECTION = "messOrders";
const WALLETS_COLLECTION = "wallets";
const WALLET_TXNS_COLLECTION = "walletTransactions";
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
  });
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
  });
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
  return onSnapshot(doc(db, WALLETS_COLLECTION, uid), (snap) => {
    callback(snap.exists() ? (snap.data().balance as number) : 0);
  });
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
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction),
    );
  });
}

export async function requestRecharge(
  uid: string,
  studentName: string,
  amount: number,
  upiRefId: string,
): Promise<void> {
  await addDoc(collection(db, WALLET_TXNS_COLLECTION), {
    uid,
    studentName,
    type: "credit",
    amount,
    reason: "Wallet recharge",
    upiRefId: upiRefId || null,
    status: "pending",
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
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
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction),
    );
  });
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

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Every SLOT_MINUTES-wide slot between breakStart and breakEnd, as "H:MM"
// strings. A break shorter than one slot still yields the single slot
// starting at breakStart.
function buildSlots(breakWindow: BreakWindow): string[] {
  const start = toMinutes(breakWindow.start);
  const end = toMinutes(breakWindow.end);
  const slots: string[] = [];
  for (let t = start; t < end; t += SLOT_MINUTES) {
    slots.push(fromMinutes(t));
  }
  return slots.length > 0 ? slots : [breakWindow.start];
}

// Places an order: no wallet involved. Creates the order as unpaid and
// hands back its id immediately so the screen can open the UPI payment
// link right away — payment itself happens outside the app, and a staff
// member confirms it landed via confirmPayment() below once they see it
// in the canteen's own UPI account.
//
// Everything here — stock check, stock decrement, token number, and order
// creation — happens inside ONE Firestore transaction. That matters under
// crowd load: if two students tap "order" on the last plate at the same
// instant, Firestore guarantees only one transaction commits with a
// consistent read of remainingQty, so the second one fails cleanly with a
// clear error instead of both succeeding and overselling.
export async function placeOrder(
  uid: string,
  studentName: string,
  cart: CartLine[],
  breakWindow: BreakWindow | null,
): Promise<{ orderId: string; tokenNumber: string; pickupSlot: string | null }> {
  const totalAmount = cart.reduce(
    (sum, line) => sum + line.price * line.qty,
    0,
  );
  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const counterRef = doc(db, TOKEN_COUNTER_DOC);
  const itemRefs = cart.map((line) => doc(db, MENU_ITEMS_COLLECTION, line.itemId));

  const today = todayKey();
  const slots = breakWindow ? buildSlots(breakWindow) : [];
  const slotCounterRefs = slots.map((slot) =>
    doc(db, SLOT_COUNTERS_COLLECTION, `${today}_${slot}`),
  );

  const result = await runTransaction(db, async (tx) => {
    // Firestore transactions require all reads before any writes, so read
    // every item + the counter + every slot counter up front.
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));
    const counterSnap = await tx.get(counterRef);
    const slotSnaps = await Promise.all(slotCounterRefs.map((ref) => tx.get(ref)));

    // Validate stock for every line before writing anything.
    itemSnaps.forEach((snap, i) => {
      const line = cart[i];
      if (!snap.exists()) {
        throw new Error(`${line.name} is no longer on the menu — please remove it from your cart.`);
      }
      const remaining = snap.data()!.remainingQty;
      if (typeof remaining === "number" && remaining < line.qty) {
        throw new Error(
          remaining === 0
            ? `${line.name} just sold out — please remove it from your cart.`
            : `Only ${remaining} × ${line.name} left — please lower the quantity.`,
        );
      }
    });

    // All good — decrement stock for tracked items.
    itemSnaps.forEach((snap, i) => {
      const remaining = snap.data()!.remainingQty;
      if (typeof remaining === "number") {
        const next = remaining - cart[i].qty;
        tx.update(itemRefs[i], { remainingQty: next, available: next > 0 });
      }
    });

    // Token number (same daily-reset counter as before).
    let count = 1;
    if (counterSnap.exists() && counterSnap.data()!.date === today) {
      count = (counterSnap.data()!.count as number) + 1;
    }
    tx.set(counterRef, { date: today, count }, { merge: true });
    const tokenNumber = `T-${String(count).padStart(3, "0")}`;

    // Pickup slot — first slot with room, else the last slot (soft overflow,
    // never blocks an order over a scheduling quirk).
    let pickupSlot: string | null = null;
    if (slots.length > 0) {
      let chosenIndex = slots.length - 1;
      for (let i = 0; i < slots.length; i++) {
        const count = slotSnaps[i].exists() ? (slotSnaps[i].data()!.count as number) : 0;
        if (count < SLOT_CAPACITY) {
          chosenIndex = i;
          break;
        }
      }
      pickupSlot = slots[chosenIndex];
      const currentCount = slotSnaps[chosenIndex].exists()
        ? (slotSnaps[chosenIndex].data()!.count as number)
        : 0;
      tx.set(
        slotCounterRefs[chosenIndex],
        { date: today, slot: pickupSlot, count: currentCount + 1 },
        { merge: true },
      );
    }

    // Create the order itself.
    tx.set(orderRef, {
      uid,
      studentName,
      items: cart,
      totalAmount,
      tokenNumber,
      pickupSlot,
      status: "pending",
      paymentStatus: "unpaid",
      paymentConfirmedBy: null,
      createdAt: serverTimestamp(),
      readyAt: null,
      readyBy: null,
      servedAt: null,
      servedBy: null,
    });

    return { tokenNumber, pickupSlot };
  });

  return { orderId: orderRef.id, ...result };
}

// Staff confirms a payment landed in the canteen's UPI account for this
// order (matched by amount + the token number in the payment note).
export async function confirmPayment(
  orderId: string,
  staffUid: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    if ((snap.data() as MessOrder).paymentStatus === "paid")
      throw new Error("Already marked paid.");
    tx.update(orderRef, {
      paymentStatus: "paid",
      paymentConfirmedBy: staffUid,
    });
  });
}

export function subscribeToOrder(
  orderId: string,
  callback: (order: MessOrder | null) => void,
) {
  return onSnapshot(doc(db, ORDERS_COLLECTION, orderId), (snap) => {
    callback(
      snap.exists() ? ({ id: snap.id, ...snap.data() } as MessOrder) : null,
    );
  });
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
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessOrder));
  });
}

export function subscribeToQueue(callback: (orders: MessOrder[]) => void) {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("status", "in", ["pending", "ready"]),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessOrder));
  });
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