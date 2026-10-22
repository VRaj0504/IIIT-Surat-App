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
): Promise<void> {
  await addDoc(collection(db, NOTICES_COLLECTION), {
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
): Promise<void> {
  await updateDoc(doc(db, NOTICES_COLLECTION, noticeId), {
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
  return persisted(`notices:${viewer === undefined ? 'staff' : JSON.stringify(viewer)}`, (onUpdate) => onSnapshot(q, (snapshot) => {
    const notices: Notice[] = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Notice, 'id'>),
      }))
      .filter((n) => {
        if (viewer === undefined) return true;
        if (n.targetBranch && n.targetBranch !== viewer?.branch) return false;
        if (n.targetSection && n.targetSection !== viewer?.section) return false;
        if (n.targetAdmissionYear && n.targetAdmissionYear !== viewer?.admissionYear) return false;
        if (n.targetSpecialization && n.targetSpecialization !== viewer?.specialization) return false;
        return true;
      });
    onUpdate(notices);
  }), onUpdate);
}