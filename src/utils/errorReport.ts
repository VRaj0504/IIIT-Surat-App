import { Platform } from "react-native";
import Constants from "expo-constants";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";

// Sends app crashes to the clientErrors collection so an admin can see them in the faculty portal
// (Staff > App health). At most a few per app session, and the same message is sent once.

const MAX_PER_SESSION = 5;
const KEEP_DAYS = 30;
const sent = new Set<string>();
let currentScreen = "";

/** Remembers which screen the user is on, so a report says where it happened. */
export function setErrorScreen(name: string | undefined) {
  currentScreen = name ?? "";
}

export function reportError(error: unknown, where: "render" | "global" | "promise") {
  try {
    const user = auth.currentUser;
    if (!user || sent.size >= MAX_PER_SESSION) return;
    const e = error as { message?: unknown; stack?: unknown } | undefined;
    const message = String(e?.message ?? error ?? "Unknown error").slice(0, 300);
    if (!message || sent.has(message)) return;
    sent.add(message);
    addDoc(collection(db, "clientErrors"), {
      message,
      stack: String(e?.stack ?? "").slice(0, 1500),
      where,
      screen: currentScreen.slice(0, 40),
      platform: Platform.OS,
      appVersion: String(Constants.expoConfig?.version ?? "").slice(0, 20),
      uid: user.uid,
      at: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 86400000),
    }).catch(() => {});
  } catch {
    // Reporting must never cause a second crash.
  }
}

let installed = false;

/** Catches errors that happen outside rendering (timers, event handlers, rejected promises). */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    window.addEventListener("error", (ev) => reportError(ev.error ?? ev.message, "global"));
    window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason, "promise"));
    return;
  }
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
  };
  const previous = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((e, fatal) => {
    reportError(e, "global");
    previous?.(e, fatal);
  });
}
