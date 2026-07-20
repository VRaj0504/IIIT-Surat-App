import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';

export type Notice = {
  id: string;
  title: string;
  description: string;
  category: 'Academic' | 'Placement' | 'Event' | 'General' | 'Club';
  clubId: string | null;
  clubName: string | null;
  link?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

const NOTICES_COLLECTION = 'notices';

export async function createNotice(
  title: string,
  description: string,
  category: Notice['category'],
  createdBy: string,
  createdByName: string,
  club?: { id: string; name: string },
  link?: string
): Promise<void> {
  await addDoc(collection(db, NOTICES_COLLECTION), {
    title,
    description,
    category,
    clubId: club ? club.id : null,
    clubName: club ? club.name : null,
    ...(link && link.trim() ? { link: link.trim() } : {}),
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}


// Only the original poster can edit/delete their own notice (enforced by
// firestore.rules — createdBy must match and can't be changed).
export async function updateNotice(
  noticeId: string,
  title: string,
  description: string,
  link?: string
): Promise<void> {
  await updateDoc(doc(db, NOTICES_COLLECTION, noticeId), {
    title,
    description,
    ...(link && link.trim() ? { link: link.trim() } : { link: null }),
  });
}

export async function deleteNotice(noticeId: string): Promise<void> {
  await deleteDoc(doc(db, NOTICES_COLLECTION, noticeId));
}

const NOTICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Auto-hides anything older than 30 days from the feed — purely client-side,
// nothing is actually deleted from Firestore. Keeps the feed from filling up
// with stale notices without needing anyone to remember to clean up.
export function subscribeToNotices(onUpdate: (notices: Notice[]) => void): () => void {
  const q = query(collection(db, NOTICES_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const cutoff = Date.now() - NOTICE_MAX_AGE_MS;
    const notices: Notice[] = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Notice, 'id'>),
      }))
      .filter((n) => !n.createdAt || n.createdAt.toMillis() >= cutoff);
    onUpdate(notices);
  });
}