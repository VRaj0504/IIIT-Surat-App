import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const COLLECTION = "passwordResets";
const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_TRIES = 5;

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
    try {
      const user = await admin.auth().getUserByEmail(email);

      if (!user.providerData.some((p) => p.providerId === "password")) return {ok: true};

      const ref = admin.firestore().collection(COLLECTION).doc(docIdFor(email));
      const snap = await ref.get();
      const last = snap.exists ? (snap.data()?.sentAt as number | undefined) ?? 0 : 0;
      if (Date.now() - last < COOLDOWN_MS) return {ok: true};

      const code = String(crypto.randomInt(100000, 1000000));
      const salt = crypto.randomBytes(8).toString("hex");
      await ref.set({
        uid: user.uid,
        salt,
        codeHash: hashCode(email, code, salt),
        expiresAt: Date.now() + TTL_MS,
        sentAt: Date.now(),
        tries: 0,
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
  if (newPassword.length < 8) throw new HttpsError("invalid-argument", "Use at least 8 characters for the password.");

  const ref = admin.firestore().collection(COLLECTION).doc(docIdFor(email));
  const snap = await ref.get();
  const d = snap.data() as {uid: string; salt: string; codeHash: string; expiresAt: number; tries: number} | undefined;
  const bad = () => new HttpsError("permission-denied", "That code is wrong or has expired. Request a new one.");
  if (!d || Date.now() > d.expiresAt) {
    if (d) await ref.delete();
    throw bad();
  }
  if (d.tries >= MAX_TRIES) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Too many wrong tries. Request a new code.");
  }
  const given = Buffer.from(hashCode(email, code, d.salt));
  const want = Buffer.from(d.codeHash);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    await ref.update({tries: admin.firestore.FieldValue.increment(1)});
    throw bad();
  }
  await admin.auth().updateUser(d.uid, {password: newPassword});
  await admin.auth().revokeRefreshTokens(d.uid);
  await ref.delete();
  return {ok: true};
});
