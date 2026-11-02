import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firestore";
import { readCached, writeCached } from "./liveCache";

export type RosterDoc = {
  id: string;
  name?: string;
  branch?: string;
  section?: string | null;
  specialization?: string;
  program?: string;
  reviewer?: boolean;
};

const TTL_MS = 5 * 60 * 1000;
const byYear = new Map<number, { at: number; p: Promise<RosterDoc[]> }>();

export function rosterForYear(admissionYear: number): Promise<RosterDoc[]> {
  const hit = byYear.get(admissionYear);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = getDocs(query(collection(db, "roster"), where("admissionYear", "==", admissionYear))).then((snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterDoc, "id">) }));
    if (rows.length) writeCached(`roster:${admissionYear}`, rows);
    return rows;
  });
  byYear.set(admissionYear, { at: Date.now(), p });
  p.catch(() => byYear.delete(admissionYear));
  return readCached<RosterDoc[]>(`roster:${admissionYear}`).then((saved) => (saved && saved.length ? saved : p));
}

let yearsCache: { at: number; p: Promise<number[]> } | null = null;

export function rosterYears(): Promise<number[]> {
  if (yearsCache && Date.now() - yearsCache.at < TTL_MS) return yearsCache.p;
  const now = new Date().getFullYear();
  const candidates = Array.from({ length: 7 }, (_, i) => now - i);
  const p = Promise.all(
    candidates.map((y) =>
      getDocs(query(collection(db, "roster"), where("admissionYear", "==", y), limit(1)))
        .then((s) => (s.empty ? null : y))
        .catch(() => null),
    ),
  ).then((ys) => {
    const out = ys.filter((y): y is number => y !== null).sort((a, b) => b - a);
    if (out.length) writeCached("roster-years", out);
    return out;
  });
  yearsCache = { at: Date.now(), p };
  p.catch(() => (yearsCache = null));
  return readCached<number[]>("roster-years").then((saved) => (saved && saved.length ? saved : p));
}
