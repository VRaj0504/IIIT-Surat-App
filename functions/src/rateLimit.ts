import * as crypto from "crypto";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, CallableRequest} from "firebase-functions/v2/https";

/** The caller's IP, as seen by Cloud Run (first hop of X-Forwarded-For). */
export function callerIp(req: CallableRequest): string {
  const fwd = String(req.rawRequest?.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return fwd || req.rawRequest?.ip || "unknown";
}

/**
 * Counts calls per key in a fixed window and refuses once over the limit.
 * Keys are hashed, so no raw IPs or emails are stored. Old counters are removed by the TTL on `expireAt`.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, message = "Too many tries. Wait a while and try again."): Promise<void> {
  const bucket = Math.floor(Date.now() / windowMs);
  const id = crypto.createHash("sha256").update(`${key}|${windowMs}|${bucket}`).digest("hex").slice(0, 40);
  const ref = getFirestore().collection("rateLimits").doc(id);
  const allowed = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = (snap.data()?.n as number | undefined) ?? 0;
    if (n >= limit) return false;
    tx.set(ref, {n: n + 1, expireAt: Timestamp.fromMillis((bucket + 2) * windowMs), at: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", message);
}
