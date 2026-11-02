import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import * as crypto from "crypto";

const keyId = defineSecret("RAZORPAY_KEY_ID");
const keySecret = defineSecret("RAZORPAY_KEY_SECRET");
const webhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const planMonthly = defineSecret("PLUS_PLAN_MONTHLY");
const planYearly = defineSecret("PLUS_PLAN_YEARLY");

const REGION = "asia-south1";
const TRIAL_DAYS = 7;
const GRACE_MS = 2 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DOMAIN = "@iiitsurat.ac.in";

type PlanKey = "monthly" | "yearly";
type SubDoc = {
  uid: string;
  plan: PlanKey;
  razorpaySubscriptionId: string;
  status: string;
  entitledUntil?: Timestamp;
  trialUsed?: boolean;
  chargedAt?: Timestamp;
  lastEventAt?: number;
  cancelAtCycleEnd?: boolean;
};

const subRef = (uid: string) => getFirestore().collection("subscriptions").doc(uid);

async function razorpay(path: string, body: unknown) {
  const auth = Buffer.from(`${keyId.value()}:${keySecret.value()}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: {Authorization: `Basic ${auth}`, "Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[razorpay]", path, res.status, JSON.stringify(json?.error ?? json));
    throw new HttpsError("unavailable", "Payment service is busy. Try again in a minute.");
  }
  return json;
}

async function plusAllowed(uid: string): Promise<boolean> {
  const db = getFirestore();
  const [cfg, mine] = await Promise.all([
    db.collection("plusConfig").doc("main").get(),
    db.collection("plusAccess").doc(uid).get(),
  ]);
  return cfg.get("enabled") === true || mine.exists;
}

function requireStudent(req: {auth?: {uid: string; token: Record<string, any>}}) {
  const a = req.auth;
  if (!a) throw new HttpsError("unauthenticated", "Log in first.");
  const email = String(a.token.email ?? "").toLowerCase();
  if (!email.endsWith(DOMAIN) || a.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verify your institute email first.");
  }
  return {uid: a.uid, email};
}

export const createPlusSubscription = onCall(
  {
    region: REGION,
    concurrency: 40,
    maxInstances: 20,
    timeoutSeconds: 30,
    secrets: [keyId, keySecret, planMonthly, planYearly],
  },
  async (req) => {
    const {uid, email} = requireStudent(req);
    if (!(await plusAllowed(uid))) throw new HttpsError("permission-denied", "Plus isn't available yet.");
    const plan = req.data?.plan as PlanKey;
    if (plan !== "monthly" && plan !== "yearly") throw new HttpsError("invalid-argument", "Choose a plan.");

    const snap = await subRef(uid).get();
    const prev = snap.exists ? (snap.data() as SubDoc) : undefined;
    const now = Date.now();
    const live = prev && prev.entitledUntil && prev.entitledUntil.toMillis() > now && !prev.cancelAtCycleEnd &&
      ["active", "authenticated", "trial", "past_due", "paused"].includes(prev.status);
    if (live) {
      throw new HttpsError("already-exists", "You already have an active plan. Cancel it first to switch.");
    }

    const trial = !prev?.trialUsed;
    const body: Record<string, unknown> = {
      plan_id: plan === "monthly" ? planMonthly.value() : planYearly.value(),
      total_count: plan === "monthly" ? 120 : 10,
      quantity: 1,
      customer_notify: 1,
      notes: {uid, email, plan},
    };
    if (trial) body.start_at = Math.floor((now + TRIAL_DAYS * DAY_MS) / 1000) + 3600;
    const sub = await razorpay("/subscriptions", body);

    await subRef(uid).set(
      {
        uid,
        plan,
        razorpaySubscriptionId: sub.id,
        status: "created",
        trialPending: trial,
        cancelAtCycleEnd: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return {subscriptionId: sub.id, keyId: keyId.value(), trial};
  },
);

export const cancelPlusSubscription = onCall(
  {region: REGION, timeoutSeconds: 30, secrets: [keyId, keySecret]},
  async (req) => {
    const {uid} = requireStudent(req);
    const snap = await subRef(uid).get();
    const d = snap.data() as SubDoc | undefined;
    if (!d?.razorpaySubscriptionId) throw new HttpsError("not-found", "No plan to cancel.");
    if (["cancelled", "completed", "expired", "created"].includes(d.status)) return {ok: true};
    const charged = !!d.chargedAt;
    try {
      await razorpay(`/subscriptions/${d.razorpaySubscriptionId}/cancel`, {cancel_at_cycle_end: charged ? 1 : 0});
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("unavailable", "Couldn't cancel right now. Try again.");
    }
    await subRef(uid).set(
      {cancelAtCycleEnd: charged, cancelRequestedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    return {ok: true, endsAtCycleEnd: charged};
  },
);

function verify(raw: Buffer, sig: string, secret: string): boolean {
  const want = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function planPatch(event: string, ent: any, prev: SubDoc | undefined, nowMs: number) {
  const currentEnd = ent.current_end ? ent.current_end * 1000 : 0;
  const startAt = ent.start_at ? ent.start_at * 1000 : 0;
  const prevEnd = prev?.entitledUntil?.toMillis() ?? 0;
  const patch: Record<string, unknown> = {};
  switch (event) {
    case "subscription.authenticated":
      patch.status = startAt > nowMs ? "trial" : "authenticated";
      patch.entitledUntil = Timestamp.fromMillis(Math.max(prevEnd, startAt || nowMs + DAY_MS));
      patch.trialUsed = true;
      break;
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      patch.status = "active";
      patch.entitledUntil = Timestamp.fromMillis(Math.max(prevEnd, currentEnd + GRACE_MS));
      patch.chargedAt = Timestamp.fromMillis(nowMs);
      patch.trialUsed = true;
      break;
    case "subscription.pending":
      patch.status = "past_due";
      break;
    case "subscription.halted":
      patch.status = "halted";
      break;
    case "subscription.paused":
      patch.status = "paused";
      break;
    case "subscription.cancelled":
      patch.status = "cancelled";
      if (!prev?.chargedAt) patch.entitledUntil = Timestamp.fromMillis(Math.min(prevEnd, nowMs));
      break;
    case "subscription.completed":
    case "subscription.expired":
      patch.status = event === "subscription.completed" ? "completed" : "expired";
      break;
    default:
      return null;
  }
  return patch;
}

export const razorpayWebhook = onRequest(
  {region: REGION, secrets: [webhookSecret], concurrency: 80, maxInstances: 20},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method");
      return;
    }
    const sig = String(req.header("x-razorpay-signature") ?? "");
    const raw = req.rawBody;
    if (!sig || !raw || !verify(raw, sig, webhookSecret.value())) {
      res.status(400).send("bad signature");
      return;
    }
    const eventId = String(req.header("x-razorpay-event-id") ?? "");
    const body = req.body as any;
    const event = String(body?.event ?? "");
    const ent = body?.payload?.subscription?.entity;
    if (!ent?.id || !event.startsWith("subscription.")) {
      res.status(200).send("ignored");
      return;
    }
    const db = getFirestore();
    try {
      let uid = String(ent.notes?.uid ?? "");
      if (!uid) {
        const q = await db.collection("subscriptions").where("razorpaySubscriptionId", "==", ent.id).limit(1).get();
        uid = q.empty ? "" : q.docs[0].id;
      }
      if (!uid) {
        res.status(200).send("no user");
        return;
      }
      const createdAt = Number(body?.created_at ?? 0) * 1000;
      const nowMs = Date.now();
      await db.runTransaction(async (tx) => {
        const ref = subRef(uid);
        const evRef = eventId ? db.collection("razorpayEvents").doc(eventId) : null;
        const [snap, ev] = await Promise.all([tx.get(ref), evRef ? tx.get(evRef) : Promise.resolve(null)]);
        if (ev?.exists) return;
        if (evRef) tx.create(evRef, {event, at: FieldValue.serverTimestamp()});
        const prev = snap.exists ? (snap.data() as SubDoc) : undefined;
        if (prev?.razorpaySubscriptionId && prev.razorpaySubscriptionId !== ent.id) return;
        if (prev?.lastEventAt && createdAt && createdAt < prev.lastEventAt) return;
        const patch = planPatch(event, ent, prev, nowMs);
        if (!patch) return;
        tx.set(
          ref,
          {
            ...patch,
            uid,
            razorpaySubscriptionId: ent.id,
            plan: ent.notes?.plan === "yearly" ? "yearly" : prev?.plan ?? "monthly",
            lastEventAt: createdAt || nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      });
      res.status(200).send("ok");
    } catch (e) {
      console.error("[razorpayWebhook]", e);
      res.status(500).send("retry");
    }
  },
);
