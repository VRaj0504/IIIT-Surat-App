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
  // Optional targeting — null/undefined on any of these means "everyone"
  // for that dimension. A notice with targetBranch set but no
  // targetSection/targetAdmissionYear reaches every section/year of that
  // branch; all three set together narrows to one specific class.
  targetBranch?: 'CSE' | 'ECE' | 'MNC' | null;
  targetSection?: string | null;
  targetAdmissionYear?: number | null;
  // Only meaningful when the targeted section actually mixes
  // specializations within the same branch (e.g. CSE C split into
  // Core/Cyber Security) — null means "everyone in this section", not
  // "nobody".
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


// Only the original poster can edit/delete their own notice (enforced by
// firestore.rules — createdBy must match and can't be changed).
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

const NOTICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Auto-hides anything older than 30 days from the feed — purely client-side,
// nothing is actually deleted from Firestore. Keeps the feed from filling up
// with stale notices without needing anyone to remember to clean up.
//
// `viewer` scopes targeted notices to the signed-in student's own
// branch/section/year — a notice with no targeting set on a given field
// reaches everyone for that field, so all three being null means "everyone".
// Omit `viewer` (or pass role 'faculty'/'admin') to see every notice
// regardless of targeting, since staff need to moderate/manage all of them.
export function subscribeToNotices(
  onUpdate: (notices: Notice[]) => void,
  viewer?: { branch?: string; section?: string; admissionYear?: number; specialization?: string } | null,
): () => void {
  const q = query(collection(db, NOTICES_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const cutoff = Date.now() - NOTICE_MAX_AGE_MS;
    const notices: Notice[] = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Notice, 'id'>),
      }))
      .filter((n) => !n.createdAt || n.createdAt.toMillis() >= cutoff)
      .filter((n) => {
        if (viewer === undefined) return true; // faculty/admin: see everything
        if (n.targetBranch && n.targetBranch !== viewer?.branch) return false;
        if (n.targetSection && n.targetSection !== viewer?.section) return false;
        if (n.targetAdmissionYear && n.targetAdmissionYear !== viewer?.admissionYear) return false;
        if (n.targetSpecialization && n.targetSpecialization !== viewer?.specialization) return false;
        return true;
      });
    onUpdate(notices);
  });
}