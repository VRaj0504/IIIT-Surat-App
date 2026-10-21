import AsyncStorage from "@react-native-async-storage/async-storage";
import { Timestamp } from "firebase/firestore";

// Makes screens open instantly.
//
// Every live list in the app (timetable, notices, exam dates, …) used to start
// empty and wait for the network each time a screen opened, and again on every
// app launch. `persisted()` wraps any `subscribe(onUpdate) => unsubscribe`
// function so that:
//   1. the last value is handed back straight away (from memory if this
//      session has seen it, otherwise from the phone's storage),
//   2. the live Firestore data then replaces it as soon as it arrives,
//   3. the newest live value is saved for next time.
// So a returning user sees their timetable immediately, even offline, and the
// screen quietly updates if anything changed.

const PREFIX = "cg-cache:v1:";
const memory = new Map<string, { v: unknown; j: string }>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

// Firestore Timestamps become {seconds, nanoseconds, type} in JSON; turn them
// back into real Timestamps so `.toMillis()` / `.toDate()` keep working.
function revive(_key: string, value: any) {
  if (value && typeof value === "object" && value.type === "firestore/timestamp/1.0" && typeof value.seconds === "number") {
    return new Timestamp(value.seconds, value.nanoseconds ?? 0);
  }
  return value;
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export async function readCached<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key)!.v as T;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw == null) return undefined;
    if (!memory.has(key)) memory.set(key, { v: JSON.parse(raw, revive), j: raw });
    return memory.get(key)!.v as T;
  } catch {
    return undefined;
  }
}

export function writeCached<T>(key: string, value: T) {
  const j = toJson(value);
  memory.set(key, { v: value, j });
  if (!j) return;
  // Live listeners can fire several times in a row; save once they settle.
  const old = pendingWrites.get(key);
  if (old) clearTimeout(old);
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      AsyncStorage.setItem(PREFIX + key, j).catch(() => {});
    }, 400),
  );
}

export function persisted<T>(
  key: string,
  subscribe: (onUpdate: (value: T) => void) => () => void,
  onUpdate: (value: T) => void,
): () => void {
  let live = false;
  let closed = false;
  let shownJson: string | null = null; // what the screen is showing right now

  const fromMemory = memory.get(key);
  if (fromMemory) {
    shownJson = fromMemory.j;
    onUpdate(fromMemory.v as T);
  } else
    readCached<T>(key).then((v) => {
      if (v === undefined || live || closed) return;
      shownJson = memory.get(key)?.j ?? null;
      onUpdate(v);
    });

  const unsubscribe = subscribe((value) => {
    live = true;
    if (closed) return;
    const j = toJson(value);
    // Live data identical to what's already on screen: nothing to redraw.
    if (j && j === shownJson) return;
    shownJson = j || null;
    writeCached(key, value);
    onUpdate(value);
  });

  return () => {
    closed = true;
    unsubscribe();
  };
}

// Sign-out: forget everything this phone saved for the last account.
export async function clearCache() {
  memory.clear();
  pendingWrites.forEach((t) => clearTimeout(t));
  pendingWrites.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch {
    // nothing to clear
  }
}
