import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerIp, rateLimit} from "./rateLimit";
import {COLLEGE_DOMAIN, isCollegeEmail} from "./college";

const DOMAIN = COLLEGE_DOMAIN;
const norm = (v: unknown) => String(v ?? "").trim();

async function onFacultyList(email: string): Promise<boolean> {
  const snap = await getFirestore().collection("allowlist").doc(email).get();
  return snap.exists && snap.get("role") === "faculty";
}

async function onApprovedList(email: string): Promise<boolean> {
  const db = getFirestore();
  const local = email.slice(0, -DOMAIN.length).toUpperCase();
  const [roster, allow] = await Promise.all([
    db.collection("roster").doc(local).get(),
    db.collection("allowlist").doc(email).get(),
  ]);
  if (roster.exists || allow.exists) return true;
  const byEmail = await db.collection("roster").where("email", "==", email).limit(1).get();
  return !byEmail.empty;
}

export const createAccount = onCall(
  {region: "asia-south1", concurrency: 80, maxInstances: 40, memory: "256MiB", timeoutSeconds: 30},
  async (req) => {
    const email = norm(req.data?.email).toLowerCase();
    const password = String(req.data?.password ?? "");
    const name = norm(req.data?.name).slice(0, 80);
    if (!isCollegeEmail(email)) {
      throw new HttpsError("invalid-argument", `Use your institute email (${DOMAIN}).`);
    }
    if (password.length < 8 || password.length > 128) {
      throw new HttpsError("invalid-argument", "Use at least 8 characters for the password.");
    }
    if (name.length < 2) throw new HttpsError("invalid-argument", "Enter your full name.");

    if (req.data?.audience === "faculty") {
      if (!(await onFacultyList(email))) {
        throw new HttpsError(
          "failed-precondition",
          "This portal is only for faculty and admin accounts on the approved list. Students can use the IIIT Surat app.",
        );
      }
    } else if (!(await onApprovedList(email))) {
      throw new HttpsError(
        "failed-precondition",
        "This email isn't on the student roster or the faculty list yet. Contact the academic office.",
      );
    }
    // Slow down scripts: per network and per email.
    const ip = callerIp(req);
    await rateLimit(`signup-ip:${ip}`, 20, 60 * 60 * 1000, "Too many sign-ups from this network. Try again in an hour.");
    await rateLimit(`signup-email:${email}`, 5, 24 * 60 * 60 * 1000, "Too many tries for this email today. Try again tomorrow or use \"Forgot password\".");

    // Someone may have started an account with this email but never verified it (they can't, without the inbox).
    // After an hour, let the real owner sign up instead of being stuck on "already has an account".
    try {
      const existing = await getAuth().getUserByEmail(email);
      const ageMs = Date.now() - Date.parse(existing.metadata.creationTime);
      const hasProfile = (await getFirestore().collection("users").doc(existing.uid).get()).exists;
      if (!existing.emailVerified && !hasProfile && ageMs > 60 * 60 * 1000) {
        await getAuth().deleteUser(existing.uid);
        console.log("[createAccount] replaced an unverified account older than 1 hour");
      }
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") console.error("[createAccount] lookup", e?.code);
    }

    try {
      await getAuth().createUser({email, password, displayName: name, emailVerified: false});
    } catch (e: any) {
      if (e?.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "This email already has an account. Log in instead, or use \"Forgot password\".");
      }
      if (e?.code === "auth/invalid-password") {
        throw new HttpsError("invalid-argument", "Choose a stronger password (at least 8 characters).");
      }
      console.error("[createAccount]", e?.code, e?.message);
      throw new HttpsError("unavailable", "Couldn't create the account right now. Try again in a minute.");
    }
    return {ok: true};
  },
);
