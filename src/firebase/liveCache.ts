import AsyncStorage from "@react-native-async-storage/async-storage";
import { Timestamp } from "firebase/firestore";

const PREFIX = "cg-cache:v1:";
const memory = new Map<string, { v: unknown; j: string }>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

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
  let shownJson: string | null = null;

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
