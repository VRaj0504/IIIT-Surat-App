import { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth } from "./auth";
import { db } from "./firestore";
import { readCached, writeCached } from "./liveCache";

// Report and block, for posts made by students and club leads (club events and notices).
// Reports go to contentReports and are reviewed by an admin on the faculty portal.
// Each person's block list is userBlocks/{uid}.blocked = { [authorUid]: authorName }; posts by blocked
// people are filtered out in the services (clubsService, noticesService), so every screen hides them.

export const REPORT_REASONS = [
  { key: "spam", label: "Spam or misleading" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate", label: "Hate speech" },
  { key: "sexual", label: "Sexual or explicit content" },
  { key: "violence", label: "Violence or threats" },
  { key: "false", label: "False information" },
  { key: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export type ReportTarget = {
  kind: "notice" | "event";
  id: string;
  title: string;
  createdBy?: string;
  createdByName?: string;
  clubId?: string | null;
  clubName?: string | null;
};

export async function reportContent(target: ReportTarget, reason: ReportReason) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  await addDoc(collection(db, "contentReports"), {
    kind: target.kind,
    contentId: target.id,
    title: String(target.title ?? "").slice(0, 200),
    authorUid: target.createdBy ?? "",
    authorName: String(target.createdByName ?? "").slice(0, 120),
    clubName: String(target.clubName ?? "").slice(0, 120),
    reason,
    reporterUid: uid,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

// ---- Block list: one shared listener for the signed-in user ----
let blocked: Record<string, string> = {};
const listeners = new Set<() => void>();
let started = false;
let stopDoc: (() => void) | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  onAuthStateChanged(auth, (u) => {
    stopDoc?.();
    stopDoc = null;
    blocked = {};
    notify();
    if (!u) return;
    let live = false;
    readCached<Record<string, string>>(`blocks:${u.uid}`).then((v) => {
      if (v && !live && auth.currentUser?.uid === u.uid) {
        blocked = v;
        notify();
      }
    });
    stopDoc = onSnapshot(
      doc(db, "userBlocks", u.uid),
      (s) => {
        live = true;
        blocked = (s.exists() ? (s.get("blocked") as Record<string, string>) : null) ?? {};
        writeCached(`blocks:${u.uid}`, blocked);
        notify();
      },
      () => undefined,
    );
  });
}

export function onBlocksChange(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const isBlocked = (uid?: string | null) => !!uid && uid in blocked;

/** Wraps a list callback so posts by blocked people are dropped, and re-emits when the block list changes. */
export function hideBlocked<T extends { createdBy?: string }>(onUpdate: (items: T[]) => void) {
  let last: T[] | null = null;
  const emit = () => {
    if (last) onUpdate(last.filter((x) => !isBlocked(x.createdBy)));
  };
  const stop = onBlocksChange(emit);
  return {
    onUpdate: (items: T[]) => {
      last = items;
      emit();
    },
    stop,
  };
}

export async function blockUser(authorUid: string, authorName: string) {
  const uid = auth.currentUser?.uid;
  if (!uid || !authorUid || authorUid === uid) return;
  blocked = { ...blocked, [authorUid]: authorName || "Unknown" };
  notify();
  await setDoc(
    doc(db, "userBlocks", uid),
    { blocked: { [authorUid]: String(authorName || "Unknown").slice(0, 120) }, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function unblockUser(authorUid: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const next = { ...blocked };
  delete next[authorUid];
  blocked = next;
  notify();
  await setDoc(doc(db, "userBlocks", uid), { blocked: { [authorUid]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

export function useBlockedList(): { uid: string; name: string }[] {
  const read = () => Object.entries(blocked).map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  const [list, setList] = useState(read);
  useEffect(() => {
    setList(read());
    return onBlocksChange(() => setList(read()));
  }, []);
  return list;
}

/** Alert.alert with buttons does nothing on web, so the web app uses the browser's confirm and alert. */
export function confirmAction(title: string, message: string, okLabel: string, onOk: () => void, destructive = false) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: okLabel, style: destructive ? "destructive" : "default", onPress: onOk },
  ]);
}

export function notice(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
