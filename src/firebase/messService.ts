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

// ---------- Types ----------

export type MessCategory = "Thali" | "Snacks" | "Beverages";

export type MessMenuItem = {
  id: string;
  name: string;
  category: MessCategory;
  price: number;
  available: boolean;
};

export type CartLine = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

export type OrderStatus = "pending" | "ready" | "served" | "cancelled";

export type MessOrder = {
  id: string;
  uid: string;
  studentName: string;
  items: CartLine[];
  totalAmount: number;
  tokenNumber: string; // e.g. "A-014" — resets daily
  status: OrderStatus;
  createdAt: Timestamp | null;
  servedAt: Timestamp | null;
  servedBy: string | null;
};

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
  status: WalletTxnStatus; // credits from recharge requests start 'pending'; debits from orders are auto 'approved'
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

// ---------- Wallet ----------

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

// Student submits a recharge request (they've already paid the mess office /
// sent a UPI transfer outside the app — this just logs the claim for a
// faculty/mess-staff member to verify and approve). Nothing is deducted or
// credited here; approveRecharge() below does that atomically.
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

// Staff approves a pending recharge: credits the wallet and marks the
// transaction approved, in one atomic transaction so a double-tap can't
// double-credit the balance.
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

// Generates the next token number for today, e.g. "T-001", "T-002", ...
// resetting automatically whenever the stored date rolls over to a new day.
async function getNextTokenNumber(): Promise<string> {
  const counterRef = doc(db, TOKEN_COUNTER_DOC);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const today = todayKey();
    let count = 1;
    if (snap.exists() && snap.data().date === today) {
      count = (snap.data().count as number) + 1;
    }
    tx.set(counterRef, { date: today, count }, { merge: true });
    return `T-${String(count).padStart(3, "0")}`;
  });
}

// Places an order: checks the wallet has enough balance, debits it, and
// creates the order + token in one atomic transaction (so two rapid orders
// can't both succeed off a balance that only covers one of them). The
// token counter increment happens as a separate transaction right after,
// since Firestore transactions can't safely mix a `where`-free counter
// bump with the balance/order writes across two different top-level docs
// while keeping retry semantics simple — the tiny window this opens (an
// order existing a moment before its token is assigned) is invisible to
// the user, who sees both appear together on screen.
export async function placeOrder(
  uid: string,
  studentName: string,
  cart: CartLine[],
): Promise<string> {
  const totalAmount = cart.reduce(
    (sum, line) => sum + line.price * line.qty,
    0,
  );
  const walletRef = doc(db, WALLETS_COLLECTION, uid);
  const orderRef = doc(collection(db, ORDERS_COLLECTION));

  await runTransaction(db, async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const balance = walletSnap.exists()
      ? (walletSnap.data().balance as number)
      : 0;
    if (balance < totalAmount) {
      throw new Error(
        "Insufficient wallet balance. Please recharge your wallet.",
      );
    }
    tx.set(
      walletRef,
      { balance: balance - totalAmount, updatedAt: serverTimestamp() },
      { merge: true },
    );
    tx.set(orderRef, {
      uid,
      studentName,
      items: cart,
      totalAmount,
      tokenNumber: "", // filled in right after, once the token counter is reserved
      status: "pending",
      createdAt: serverTimestamp(),
      servedAt: null,
      servedBy: null,
    });
  });

  const tokenNumber = await getNextTokenNumber();
  await setDoc(orderRef, { tokenNumber }, { merge: true });

  await addDoc(collection(db, WALLET_TXNS_COLLECTION), {
    uid,
    studentName,
    type: "debit",
    amount: totalAmount,
    reason: `Mess order ${tokenNumber}`,
    upiRefId: null,
    status: "approved",
    createdAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
    resolvedBy: null,
  });

  return orderRef.id;
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

// Live counter queue for the staff screen — every order not yet served today.
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

export async function markOrderServed(
  orderId: string,
  staffUid: string,
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error("Order not found.");
    if ((snap.data() as MessOrder).status === "served")
      throw new Error("Already served.");
    tx.update(orderRef, {
      status: "served",
      servedAt: serverTimestamp(),
      servedBy: staffUid,
    });
  });
}
