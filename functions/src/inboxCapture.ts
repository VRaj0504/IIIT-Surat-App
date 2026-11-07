import {createHash} from "node:crypto";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

const PUSH_URL = "https://exp.host/--/api/v2/push/send";
const KEEP_DAYS = 60;
const IN_LIMIT = 30;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type PushMessage = {
  to?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
};

function isPushCall(input: unknown): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as {url?: string})?.url;
  return typeof url === "string" && url.startsWith(PUSH_URL);
}

function parseMessages(init?: RequestInit): PushMessage[] {
  if (!init || typeof init.body !== "string") return [];
  try {
    const parsed = JSON.parse(init.body);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((m): m is PushMessage => !!m && typeof m.to === "string" && !!(m.title || m.body));
  } catch {
    return [];
  }
}

async function ownersOf(tokens: string[]): Promise<Map<string, string>> {
  const db = getFirestore();
  const owner = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += IN_LIMIT) {
    const chunk = tokens.slice(i, i + IN_LIMIT);
    const [single, multi] = await Promise.all([
      db.collection("users").where("expoPushToken", "in", chunk).get(),
      db.collection("users").where("expoPushTokens", "array-contains-any", chunk).get(),
    ]);
    for (const d of [...single.docs, ...multi.docs]) {
      const data = d.data() as {expoPushToken?: string; expoPushTokens?: string[]};
      const all = [data.expoPushToken, ...(data.expoPushTokens ?? [])];
      for (const t of all) if (t && chunk.includes(t)) owner.set(t, d.id);
    }
  }
  return owner;
}

async function saveToInbox(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const db = getFirestore();
  const owner = await ownersOf(Array.from(new Set(messages.map((m) => m.to as string))));

  const expireAt = Timestamp.fromMillis(Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000);
  const bucket = Math.floor(Date.now() / DEDUPE_WINDOW_MS);
  const seen = new Set<string>();
  let batch = db.batch();
  let count = 0;

  for (const m of messages) {
    const uid = owner.get(m.to as string);
    if (!uid) continue;
    const dataJson = m.data ? JSON.stringify(m.data) : null;
    const id = createHash("sha1").update(`${m.title}\n${m.body}\n${dataJson}\n${bucket}`).digest("hex").slice(0, 20);
    const key = `${uid}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batch.set(db.collection("users").doc(uid).collection("inbox").doc(id), {
      title: m.title ?? "",
      body: m.body ?? "",
      channel: m.channelId ?? "default",
      dataJson,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      expireAt,
    });
    count++;
    if (count === 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

const original = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const response = await original(input, init);
  if (isPushCall(input)) {
    try {
      await saveToInbox(parseMessages(init));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[inboxCapture] could not save to inbox:", err);
    }
  }
  return response;
};
