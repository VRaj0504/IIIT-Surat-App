import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {expoAccessToken} from "./globalOptions";

export function expoAuthHeader(): Record<string, string> {
  try {
    const token = expoAccessToken.value();
    return token ? {"Authorization": `Bearer ${token}`} : {};
  } catch {
    return {};
  }
}

type Ticket = {status: "ok" | "error"; message?: string; details?: {error?: string}};

async function pruneDeadTokens(dead: string[], logTag: string): Promise<void> {
  if (!dead.length) return;
  const db = getFirestore();
  await Promise.all(
    dead.map(async (token) => {
      try {
        const [single, multi] = await Promise.all([
          db.collection("users").where("expoPushToken", "==", token).get(),
          db.collection("users").where("expoPushTokens", "array-contains", token).get(),
        ]);
        const refs = new Map<string, FirebaseFirestore.DocumentReference>();
        single.docs.forEach((d) => refs.set(d.id, d.ref));
        multi.docs.forEach((d) => refs.set(d.id, d.ref));
        await Promise.all(
          Array.from(refs.values()).map((ref) =>
            ref.get().then((s) => {
              const patch: Record<string, unknown> = {expoPushTokens: FieldValue.arrayRemove(token)};
              if (s.data()?.expoPushToken === token) patch.expoPushToken = FieldValue.delete();
              return ref.update(patch);
            }),
          ),
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[${logTag}] could not prune a dead token`, err);
      }
    }),
  );
  // eslint-disable-next-line no-console
  console.log(`[${logTag}] removed ${dead.length} uninstalled device token(s)`);
}

export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  logTag: string,
  data?: Record<string, unknown>,
  channelId?: string,
): Promise<{sent: number; failed: number}> {
  const unique = Array.from(new Set(tokens.filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"))));
  if (unique.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[${logTag}] no devices to notify`);
    return {sent: 0, failed: 0};
  }

  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) chunks.push(unique.slice(i, i + CHUNK_SIZE));

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const text = body.length > 400 ? `${body.slice(0, 397)}…` : body;

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
            ...expoAuthHeader(),
          },
          body: JSON.stringify(
            chunk.map((token) => ({
              to: token,
              title,
              body: text,
              sound: "default",
              priority: "high",
              ...(data ? {data} : {}),
              channelId: channelId ?? "updates",
            })),
          ),
        });
        const raw = await res.text().catch(() => "");
        if (!res.ok) {
          failed += chunk.length;
          // eslint-disable-next-line no-console
          console.error(`[${logTag}] Expo push rejected (${res.status}):`, raw.slice(0, 500));
          return;
        }
        let tickets: Ticket[] = [];
        try {
          tickets = (JSON.parse(raw).data ?? []) as Ticket[];
        } catch {
          tickets = [];
        }
        tickets.forEach((t, i) => {
          if (t.status === "ok") sent++;
          else {
            failed++;
            if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[i]);
          }
        });
        const errs = tickets.filter((t) => t.status !== "ok");
        if (errs.length) {
          // eslint-disable-next-line no-console
          console.error(`[${logTag}] Expo ticket errors:`, JSON.stringify(errs.slice(0, 5)));
        }
      } catch (err) {
        failed += chunk.length;
        // eslint-disable-next-line no-console
        console.error(`[${logTag}] Expo push API call failed:`, err);
      }
    }),
  );

  // eslint-disable-next-line no-console
  console.log(`[${logTag}] "${title}" → ${unique.length} device(s): ${sent} sent, ${failed} failed`);
  await pruneDeadTokens(dead, logTag);
  return {sent, failed};
}
