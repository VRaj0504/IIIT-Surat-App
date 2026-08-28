import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

// A lightweight, class-targeted announcement — the "today's class is
// cancelled" case — kept deliberately separate from formal Notices:
// fewer fields, its own feed, and a data model that's already shaped for
// a push-notification layer to be added later (targetBranch/Section/Year
// are exactly what a Cloud Function would query device tokens by, and
// createdAt gives a stable ordering key). Nothing here needs Blaze; the
// push fan-out is the only part that will, and it's purely additive.
export type Announcement = {
  id: string;
  message: string;
  targetBranch: string;
  targetSection: string | null;
  targetAdmissionYear: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

const COLLECTION = "announcements";

// Distinct (branch, section) options actually present in the roster for a
// given admission year — powers the section picker in
// PostAnnouncementScreen so faculty tap a real class instead of free-typing
// one (which had to match the stored value byte-for-byte or silently reach
// nobody). Derived live from roster data, so it self-updates every year as
// new batches are seeded — nothing about sections is hardcoded. A student
// with no section on their profile (e.g. a branch with a single unsectioned
// batch) surfaces as branch-only, targetSection left null.
export type ClassOption = { branch: string; section: string | null; label: string };

export async function getClassOptionsForYear(admissionYear: number): Promise<ClassOption[]> {
  const { getDocs, query: q2, where } = await import("firebase/firestore");
  const snap = await getDocs(
    q2(collection(db, "roster"), where("admissionYear", "==", admissionYear)),
  );
  const seen = new Map<string, ClassOption>();
  snap.docs.forEach((d) => {
    const data = d.data() as { branch?: string; section?: string };
    if (!data.branch) return;
    const section = data.section ?? null;
    const key = `${data.branch}||${section ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, {
        branch: data.branch,
        section,
        label: section ? `${data.branch} ${section}` : data.branch,
      });
    }
  });
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

// Distinct admission years present in the roster, newest first — powers the
// year picker. Also derived live, so a new batch appears automatically.
export async function getAdmissionYears(): Promise<number[]> {
  const { getDocs } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, "roster"));
  const years = new Set<number>();
  snap.docs.forEach((d) => {
    const y = (d.data() as { admissionYear?: number }).admissionYear;
    if (typeof y === "number") years.add(y);
  });
  return Array.from(years).sort((a, b) => b - a);
}

// Auto-hidden from the feed after this long (client-side only, same
// approach as notices) — a "class cancelled today" notice is worthless a
// week later, so the feed stays about what's current.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function postAnnouncement(params: {
  message: string;
  targetBranch: string;
  targetSection: string | null;
  targetAdmissionYear: number | null;
  createdBy: string;
  createdByName: string;
}): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    message: params.message.trim(),
    targetBranch: params.targetBranch,
    targetSection: params.targetSection,
    targetAdmissionYear: params.targetAdmissionYear,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    createdAt: serverTimestamp(),
  });
}

// Students see only announcements matching their own branch (required) and
// — when set — their section and admission year. Unlike notices, branch is
// always required here, since a quick class announcement is inherently
// class-specific; there's no "everyone" broadcast in this feed.
// Faculty/admin (pass viewer as null) see every announcement so they can
// review what's been posted.
export function subscribeToAnnouncements(
  onUpdate: (items: Announcement[]) => void,
  viewer: { branch?: string; section?: string; admissionYear?: number } | null,
): () => void {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const cutoff = Date.now() - MAX_AGE_MS;
      const items: Announcement[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, "id">) }))
        .filter((a) => !a.createdAt || a.createdAt.toMillis() >= cutoff)
        .filter((a) => {
          if (viewer === null) return true; // faculty/admin see all
          if (a.targetBranch && a.targetBranch !== viewer.branch) return false;
          if (a.targetSection && a.targetSection !== viewer.section) return false;
          if (a.targetAdmissionYear && a.targetAdmissionYear !== viewer.admissionYear) return false;
          return true;
        });
      onUpdate(items);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[announcementsService] subscribe error:", err);
    },
  );
}

// Only the faculty who posted it (or an admin) can delete — enforced in
// firestore.rules.
export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
