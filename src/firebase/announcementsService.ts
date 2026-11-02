import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from './liveCache';
import { isForViewer } from '../utils/audience';
import { rosterForYear, rosterYears } from './rosterCache';

export type Announcement = {
  id: string;
  message: string;
  targetBranch: string;
  targetSection: string | null;
  targetAdmissionYear: number | null;

  targetSpecialization: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
};

const COLLECTION = "announcements";

export type ClassOption = {
  branch: string;
  section: string | null;
  label: string;

  specializations: string[];
};

export async function getClassOptionsForYear(admissionYear: number): Promise<ClassOption[]> {
  const rows = await rosterForYear(admissionYear);
  const seen = new Map<string, ClassOption>();
  rows.forEach((d) => {
    const data = d;
    if (!data.branch) return;
    const section = data.section ?? null;
    const key = `${data.branch}||${section ?? ""}`;

    const pg = data.program === "PG" || /^PG/i.test(d.id);
    const existing = seen.get(key);
    if (existing) {
      if (data.specialization && !existing.specializations.includes(data.specialization)) {
        existing.specializations.push(data.specialization);
      }
    } else {
      seen.set(key, {
        branch: data.branch,
        section,
        label: classLabel(data.branch, section, pg),
        specializations: data.specialization ? [data.specialization] : [],
      });
    }
  });
  const options = Array.from(seen.values());
  options.forEach((o) => o.specializations.sort());

  const isPgLabel = (l: string) => l.startsWith("M.Tech");
  return options.sort((a, b) => Number(isPgLabel(a.label)) - Number(isPgLabel(b.label)) || a.label.localeCompare(b.label));
}

function classLabel(branch: string, section: string | null, pg: boolean): string {
  let label = !section ? branch : /\b(CSE|ECE|MNC)\b/i.test(section) ? section : `${branch} ${section}`;
  if (section && !new RegExp(`\\b${branch}\\b`, "i").test(label)) label += ` (${branch})`;
  return pg ? `M.Tech ${label}` : label;
}

export function yearOfStudyLabel(admissionYear: number): string {
  const now = new Date();
  const academicYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearOfStudy = academicYearStart - admissionYear + 1;
  if (yearOfStudy < 1) return `Admission ${admissionYear}`;
  const suffix = yearOfStudy === 1 ? "1st" : yearOfStudy === 2 ? "2nd" : yearOfStudy === 3 ? "3rd" : `${yearOfStudy}th`;
  return `${suffix} Year (${admissionYear})`;
}

export function getCurrentSemesterNumber(admissionYear: number): number {
  const now = new Date();
  const academicYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearOfStudy = Math.max(1, academicYearStart - admissionYear + 1);
  const isFirstHalf = now.getMonth() >= 6;
  return (yearOfStudy - 1) * 2 + (isFirstHalf ? 1 : 2);
}

export async function getAdmissionYears(): Promise<number[]> {
  return rosterYears();
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

export function subscribeToAnnouncements(
  onUpdate: (items: Announcement[]) => void,
  viewer: { branch?: string; section?: string; admissionYear?: number; specialization?: string } | null,
): () => void {

  const cutoffTimestamp = Timestamp.fromMillis(Date.now() - MAX_AGE_MS);
  const q = query(
    collection(db, COLLECTION),
    where("createdAt", ">=", cutoffTimestamp),
    orderBy("createdAt", "desc"),
  );
  return persisted(`ann:${viewer === null ? "staff" : JSON.stringify(viewer)}`, (onUpdate) => onSnapshot(
    q,
    (snapshot) => {
      const items: Announcement[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, "id">) }))
        .filter((a) => {
          if (viewer === null) return true;
          return isForViewer(a, viewer);
        });
      onUpdate(items);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[announcementsService] subscribe error:", err);
    },
  ), onUpdate);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
