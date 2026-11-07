import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "./firestore";
import { functions } from "./functionsClient";

export type PlusPlan = "monthly" | "yearly";

export type PlusSub = {
  plan: PlusPlan;
  status: string;
  entitledUntil: Date | null;
  cancelAtCycleEnd: boolean;
  trialUsed: boolean;
};

export const PLUS_PRICES: Record<PlusPlan, { amount: number; label: string; per: string }> = {
  monthly: { amount: 19, label: "Monthly", per: "month" },
  yearly: { amount: 199, label: "Yearly", per: "year" },
};
export const TRIAL_DAYS = 7;
export const PLUS_ENABLED: boolean = false;
export const PLUS_PERKS: { icon: string; title: string; sub: string; route?: "LeavePlanner" | "CgpaPlanner" }[] = [
  { icon: "airplane-outline", title: "Leave planner", sub: "Pick the days you’ll be away and see your attendance in every subject", route: "LeavePlanner" },
  { icon: "stats-chart-outline", title: "CGPA planner", sub: "What-if grades, and the SGPA you need to hit a target CGPA", route: "CgpaPlanner" },
  { icon: "rocket-outline", title: "New tools first", sub: "Every new Plus feature, as soon as it’s ready" },
];

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export function subscribeToPlus(uid: string, cb: (s: PlusSub | null) => void) {
  return onSnapshot(
    doc(db, "subscriptions", uid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const d = snap.data();
      cb({
        plan: d.plan === "yearly" ? "yearly" : "monthly",
        status: String(d.status ?? ""),
        entitledUntil: toDate(d.entitledUntil),
        cancelAtCycleEnd: d.cancelAtCycleEnd === true,
        trialUsed: d.trialUsed === true,
      });
    },
    () => cb(null),
  );
}

export function subscribeToPlusAccess(uid: string, cb: (open: boolean) => void) {
  let all = false;
  let mine = false;
  const push = () => cb(all || mine);
  const u1 = onSnapshot(doc(db, "plusConfig", "main"), (s) => { all = s.exists() && s.get("enabled") === true; push(); }, () => {});
  const u2 = onSnapshot(doc(db, "plusAccess", uid), (s) => { mine = s.exists(); push(); }, () => {});
  return () => { u1(); u2(); };
}

export const isEntitled = (s: PlusSub | null) => !!s?.entitledUntil && s.entitledUntil.getTime() > Date.now();

export async function startPlusCheckout(plan: PlusPlan) {
  const call = httpsCallable<{ plan: PlusPlan }, { subscriptionId: string; keyId: string; trial: boolean }>(
    functions,
    "createPlusSubscription",
  );
  return (await call({ plan })).data;
}

export async function cancelPlus() {
  const call = httpsCallable<unknown, { ok: boolean; endsAtCycleEnd?: boolean }>(functions, "cancelPlusSubscription");
  return (await call({})).data;
}

let scriptLoading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  const g = globalThis as any;
  if (g.Razorpay) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<void>((resolve, reject) => {
    const s = g.document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoading = null;
      reject(new Error("Couldn't load the payment window. Check your connection."));
    };
    g.document.head.appendChild(s);
  });
  return scriptLoading;
}

export function openRazorpay(opts: {
  keyId: string;
  subscriptionId: string;
  name: string;
  email: string;
  onPaid: () => void;
  onDismiss: () => void;
}) {
  const g = globalThis as any;
  const rzp = new g.Razorpay({
    key: opts.keyId,
    subscription_id: opts.subscriptionId,
    name: "CollegeGo Plus",
    description: "Campus app subscription",
    prefill: { name: opts.name, email: opts.email },
    theme: { color: "#4F46E5" },
    handler: () => opts.onPaid(),
    modal: { ondismiss: () => opts.onDismiss() },
  });
  rzp.open();
}
