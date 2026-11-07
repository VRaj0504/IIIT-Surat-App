import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import {callerIp, rateLimit} from "./rateLimit";

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const COLLECTION = "passwordResets";
const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_TRIES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CODES_PER_DAY = 5;
const ALLOWED = (email: string) => email.endsWith("@iiitsurat.ac.in") || email === "reviewer@collegego.app";

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const docIdFor = (email: string) => crypto.createHash("sha256").update(email).digest("hex");
const hashCode = (email: string, code: string, salt: string) =>
  crypto.createHash("sha256").update(`${email}:${code}:${salt}`).digest("hex");

async function sendMail(to: string, code: string) {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {user: smtpUser.value(), pass: smtpPass.value()},
  });
  await transport.sendMail({
    from: `"CollegeGo" <${smtpUser.value()}>`,
    to,
    subject: `${code} is your CollegeGo password reset code`,
    text: `Your CollegeGo password reset code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for this, ignore this email — your password hasn't changed.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">` +
      `<h2 style="margin:0 0 8px">CollegeGo</h2>` +
      `<p>Use this code to reset your password:</p>` +
      `<p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0">${code}</p>` +
      `<p style="color:#555">It works for 10 minutes. If you didn't ask for this, ignore this email — your password hasn't changed.</p>` +
      `</div>`,
  });
}

export const requestPasswordResetOtp = onCall(
  {region: "asia-south1", secrets: [smtpUser, smtpPass]},
  async (req) => {
    const email = norm(req.data?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }
    await rateLimit(`reset-ip:${callerIp(req)}`, 30, 60 * 60 * 1000, "Too many reset requests from this network. Try again in an hour.");
    if (!ALLOWED(email)) return {ok: true};
    try {
      const user = await getAuth().getUserByEmail(email);

      if (!user.providerData.some((p) => p.providerId === "password")) return {ok: true};

      const ref = getFirestore().collection(COLLECTION).doc(docIdFor(email));
      const snap = await ref.get();
      const prev = snap.exists ? snap.data() : undefined;
      const last = (prev?.sentAt as number | undefined) ?? 0;
      if (Date.now() - last < COOLDOWN_MS) return {ok: true};
      const windowStart = (prev?.windowStart as number | undefined) ?? 0;
      const inWindow = Date.now() - windowStart < DAY_MS;
      const sentToday = inWindow ? ((prev?.sentToday as number | undefined) ?? 0) : 0;
      if (sentToday >= MAX_CODES_PER_DAY) return {ok: true};

      const code = String(crypto.randomInt(100000, 1000000));
      const salt = crypto.randomBytes(8).toString("hex");
      await ref.set({
        uid: user.uid,
        salt,
        codeHash: hashCode(email, code, salt),
        expiresAt: Date.now() + TTL_MS,
        sentAt: Date.now(),
        tries: 0,
        windowStart: inWindow ? windowStart : Date.now(),
        sentToday: sentToday + 1,
      });
      await sendMail(email, code);
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") console.error("[requestPasswordResetOtp]", e);
    }
    return {ok: true};
  },
);

export const confirmPasswordResetOtp = onCall({region: "asia-south1"}, async (req) => {
  const email = norm(req.data?.email);
  const code = String(req.data?.code ?? "").trim();
  const newPassword = String(req.data?.newPassword ?? "");
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");
  await rateLimit(`reset-confirm-ip:${callerIp(req)}`, 40, 60 * 60 * 1000, "Too many tries from this network. Try again in an hour.");
  if (newPassword.length < 8) throw new HttpsError("invalid-argument", "Use at least 8 characters for the password.");

  const ref = getFirestore().collection(COLLECTION).doc(docIdFor(email));
  const bad = () => new HttpsError("permission-denied", "That code is wrong or has expired. Request a new one.");
  type ResetDoc = {uid: string; salt: string; codeHash: string; expiresAt: number; tries: number};
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.data() as ResetDoc | undefined;
    if (!doc || !doc.codeHash) return {error: "bad" as const};
    if (Date.now() > doc.expiresAt) {
      tx.update(ref, {codeHash: FieldValue.delete()});
      return {error: "bad" as const};
    }
    if (doc.tries >= MAX_TRIES) {
      tx.update(ref, {codeHash: FieldValue.delete()});
      return {error: "locked" as const};
    }
    tx.update(ref, {tries: doc.tries + 1});
    return {doc};
  });
  if ("error" in outcome) {
    if (outcome.error === "locked") throw new HttpsError("resource-exhausted", "Too many wrong tries. Request a new code.");
    throw bad();
  }
  const d = outcome.doc;
  const given = Buffer.from(hashCode(email, code, d.salt));
  const want = Buffer.from(d.codeHash);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    throw bad();
  }
  // The code reached their inbox, so the email is proven theirs.
  await getAuth().updateUser(d.uid, {password: newPassword, emailVerified: true});
  await getAuth().revokeRefreshTokens(d.uid);
  await ref.update({codeHash: FieldValue.delete(), tries: 0});
  return {ok: true};
});
