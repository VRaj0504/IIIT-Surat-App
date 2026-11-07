import {
  collection,
  doc,
  query,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  channel: string;
  read: boolean;
  createdAt: Timestamp | null;
  data: Record<string, unknown> | null;
};

export function subscribeToInbox(uid: string, onUpdate: (items: InboxItem[]) => void, onError?: () => void): () => void {
  const q = query(collection(db, "users", uid, "inbox"), orderBy("createdAt", "desc"), fsLimit(60));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const v = d.data() as any;
          let data: Record<string, unknown> | null = null;
          try {
            data = v.dataJson ? JSON.parse(v.dataJson) : null;
          } catch {
            data = null;
          }
          return {
            id: d.id,
            title: v.title ?? "",
            body: v.body ?? "",
            channel: v.channel ?? "default",
            read: !!v.read,
            createdAt: v.createdAt ?? null,
            data,
          };
        }),
      );
    },
    () => onError?.(),
  );
}

export function markInboxRead(uid: string, id: string): Promise<void> {
  return updateDoc(doc(db, "users", uid, "inbox", id), { read: true });
}

export async function markAllInboxRead(uid: string, items: InboxItem[]): Promise<void> {
  const unread = items.filter((i) => !i.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((i) => batch.update(doc(db, "users", uid, "inbox", i.id), { read: true }));
  await batch.commit();
}

export function deleteInboxItem(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, "users", uid, "inbox", id));
}

export async function clearInbox(uid: string, items: InboxItem[]): Promise<void> {
  if (!items.length) return;
  const batch = writeBatch(db);
  items.forEach((i) => batch.delete(doc(db, "users", uid, "inbox", i.id)));
  await batch.commit();
}
