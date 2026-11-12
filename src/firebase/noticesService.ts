import { isForViewer } from '../utils/audience';
import { hideBlocked } from './moderationService';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';
import { persisted } from './liveCache';

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
  pinned?: boolean;

  targetBranch?: 'CSE' | 'ECE' | 'MNC' | null;
  targetSection?: string | null;
  targetAdmissionYear?: number | null;

  targetSpecialization?: string | null;
};

const NOTICES_COLLECTION = 'notices';

export async function createNotice(
  title: string,
  description: string,
  category: Notice['category'],
  createdBy: string,
  createdByName: string,
  club?: { id: string; name: string },
  link?: string,
  targeting?: { branch?: string | null; section?: string | null; admissionYear?: number | null; specialization?: string | null },
  pinned = false,
): Promise<void> {
  await addDoc(collection(db, NOTICES_COLLECTION), {
    pinned,
    title,
    description,
    category,
    clubId: club ? club.id : null,
    clubName: club ? club.name : null,
    ...(link && link.trim() ? { link: link.trim() } : {}),
    targetBranch: targeting?.branch ?? null,
    targetSection: targeting?.section ?? null,
    targetAdmissionYear: targeting?.admissionYear ?? null,
    targetSpecialization: targeting?.specialization ?? null,
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}

export async function updateNotice(
  noticeId: string,
  title: string,
  description: string,
  link?: string,
  targeting?: { branch?: string | null; section?: string | null; admissionYear?: number | null; specialization?: string | null },
  pinned?: boolean,
): Promise<void> {
  await updateDoc(doc(db, NOTICES_COLLECTION, noticeId), {
    ...(pinned === undefined ? {} : { pinned }),
    title,
    description,
    ...(link && link.trim() ? { link: link.trim() } : { link: null }),
    ...(targeting
      ? {
          targetBranch: targeting.branch ?? null,
          targetSection: targeting.section ?? null,
          targetAdmissionYear: targeting.admissionYear ?? null,
          targetSpecialization: targeting.specialization ?? null,
        }
      : {}),
  });
}

export async function deleteNotice(noticeId: string): Promise<void> {
  await deleteDoc(doc(db, NOTICES_COLLECTION, noticeId));
}

const NOTICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const NOTICE_STAFF_VIEW_LIMIT = 500;

export function subscribeToNotices(
  onUpdate: (notices: Notice[]) => void,
  viewer?: { branch?: string; section?: string; admissionYear?: number; specialization?: string } | null,
): () => void {
  const q =
    viewer !== undefined
      ? query(
          collection(db, NOTICES_COLLECTION),
          where('createdAt', '>=', Timestamp.fromMillis(Date.now() - NOTICE_MAX_AGE_MS)),
          orderBy('createdAt', 'desc'),
        )
      : query(collection(db, NOTICES_COLLECTION), orderBy('createdAt', 'desc'), fsLimit(NOTICE_STAFF_VIEW_LIMIT));
  const toNotices = (docs: { id: string; data: () => unknown }[]): Notice[] =>
    docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<Notice, 'id'>) }))
      .filter((n) => viewer === undefined || isForViewer(n, viewer));
  const shown = hideBlocked<Notice>(onUpdate);
  const stop = persisted(`notices:${viewer === undefined ? 'staff' : JSON.stringify(viewer)}`, (onUpdate, fail) => {
    // Students only load the last 30 days, so pinned notices are fetched separately and kept on top until unpinned.
    let recent: Notice[] | null = null;
    let pinned: Notice[] = [];
    const emit = () => {
      if (recent === null) return;
      const seen = new Set(recent.map((n) => n.id));
      const extra = pinned.filter((n) => !seen.has(n.id));
      onUpdate([...recent, ...extra].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
    };
    const unsubRecent = onSnapshot(q, (snapshot) => {
      recent = toNotices(snapshot.docs);
      emit();
    }, () => fail([]));
    const unsubPinned =
      viewer !== undefined
        ? onSnapshot(query(collection(db, NOTICES_COLLECTION), where('pinned', '==', true)), (snapshot) => {
            pinned = toNotices(snapshot.docs);
            emit();
          }, () => undefined)
        : () => undefined;
    return () => {
      unsubRecent();
      unsubPinned();
    };
  }, shown.onUpdate);
  return () => {
    stop();
    shown.stop();
  };
}