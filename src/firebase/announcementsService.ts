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
  // Only meaningful when the targeted section actually mixes
  // specializations — null means "everyone in this section", not
  // "nobody". A student with no specialization set (unsplit section)
  // never matches a specialization-targeted announcement, which is
  // correct: that announcement wasn't meant for them anyway.
  targetSpecialization: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

const COLLECTION = "announcements";

// Distinct (branch, section) options actually present in the roster for a
// given admission year — powers the class picker in AnnouncementsScreen's
// compose form (and the same picker reused in Notices/Grade Entry) so
// faculty tap a real class instead of free-typing
// one (which had to match the stored value byte-for-byte or silently reach
// nobody). Derived live from roster data, so it self-updates every year as
// new batches are seeded — nothing about sections is hardcoded. A student
// with no section on their profile (e.g. a branch with a single unsectioned
// batch) surfaces as branch-only, targetSection left null.
export type ClassOption = {
  branch: string;
  section: string | null;
  label: string;
  // Distinct specializations actually present among students in this
  // exact class (e.g. ["Core", "AI/ML", "Cyber"] for a mixed section like
  // CSE B) — empty for an unsplit section like CSE A or ECE. Lets the
  // picker offer a specialization sub-choice only when one's actually
  // needed, instead of always asking.
  specializations: string[];
};

export async function getClassOptionsForYear(admissionYear: number): Promise<ClassOption[]> {
  const { getDocs, query: q2, where } = await import("firebase/firestore");
  const snap = await getDocs(
    q2(collection(db, "roster"), where("admissionYear", "==", admissionYear)),
  );
  const seen = new Map<string, ClassOption>();
  snap.docs.forEach((d) => {
    const data = d.data() as { branch?: string; section?: string; specialization?: string };
    if (!data.branch) return;
    const section = data.section ?? null;
    const key = `${data.branch}||${section ?? ""}`;
    const existing = seen.get(key);
    if (existing) {
      if (data.specialization && !existing.specializations.includes(data.specialization)) {
        existing.specializations.push(data.specialization);
      }
    } else {
      seen.set(key, {
        branch: data.branch,
        section,
        label: section ? `${data.branch} ${section}` : data.branch,
        specializations: data.specialization ? [data.specialization] : [],
      });
    }
  });
  const options = Array.from(seen.values());
  options.forEach((o) => o.specializations.sort());
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

// Distinct admission years present in the roster, newest first — powers the
// year picker. Also derived live, so a new batch appears automatically.
// Turns a raw admission year into a "Nth Year" label computed against
// today's date — never hardcoded, so it stays correct automatically as
// each academic year rolls over, instead of silently going stale (an
// admission year that means "2nd year" today will mean "3rd year" next
// August). IIIT Surat's academic year starts around July/August each
// year, so a student is treated as starting their next year of study
// once July arrives — everyone picking a year sees "1st Year"/"2nd
// Year"/etc. instead of having to mentally calculate it from a bare
// admission-year number.
export function yearOfStudyLabel(admissionYear: number): string {
  const now = new Date();
  const academicYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; // July = month index 6
  const yearOfStudy = academicYearStart - admissionYear + 1;
  if (yearOfStudy < 1) return `Admission ${admissionYear}`; // not yet started — edge case, shouldn't normally show up
  const suffix = yearOfStudy === 1 ? "1st" : yearOfStudy === 2 ? "2nd" : yearOfStudy === 3 ? "3rd" : `${yearOfStudy}th`;
  return `${suffix} Year (${admissionYear})`;
}

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
  targetSpecialization: string | null;
  createdBy: string;
  createdByName: string;
}): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    message: params.message.trim(),
    targetBranch: params.targetBranch,
    targetSection: params.targetSection,
    targetAdmissionYear: params.targetAdmissionYear,
    targetSpecialization: params.targetSpecialization,
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
  viewer: { branch?: string; section?: string; admissionYear?: number; specialization?: string } | null,
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
          if (a.targetSpecialization && a.targetSpecialization !== viewer.specialization) return false;
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
