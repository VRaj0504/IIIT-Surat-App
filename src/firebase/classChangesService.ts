import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "./functionsClient";
import { db } from "./firestore";

const COLLECTION = "classChanges";

export type ClassChangeType = "cancelled" | "room";

export type ClassChange = {
  id: string;
  date: string;
  branch: string;
  semester: number;
  section: string | null;
  subjectCode: string;
  subjectName: string;
  startTime: string;
  endTime: string;
  type: ClassChangeType;
  oldRoom: string | null;
  newRoom: string | null;
  facultyName: string;
  createdBy: string;
};

const squash = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");

function normSection(branch: unknown, section: unknown): string {
  const b = squash(branch);
  let x = squash(section).replace(/^(SECTION|SEC)/, "");
  if (b && x.startsWith(b)) x = x.slice(b.length);
  return x;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function classChangeId(p: { date: string; branch: string; semester: number; section: string | null; subjectCode: string; startTime: string }): string {
  return [p.date, squash(p.branch), p.semester, normSection(p.branch, p.section) || "ALL", squash(p.subjectCode), squash(p.startTime)].join("_");
}

export function subscribeToClassChanges(
  filter: { semester: number } | { createdBy: string },
  onUpdate: (changes: ClassChange[]) => void,
): () => void {
  const q =
    "semester" in filter
      ? query(collection(db, COLLECTION), where("semester", "==", filter.semester))
      : query(collection(db, COLLECTION), where("createdBy", "==", filter.createdBy));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassChange, "id">) }))),
    () => onUpdate([]),
  );
}

export function findClassChange(
  changes: ClassChange[],
  slot: { subjectCode: string; startTime: string },
  date: string,
  who: { branch?: string | null; section?: string | null },
): ClassChange | null {
  return (
    changes.find((c) => {
      if (c.date !== date || squash(c.subjectCode) !== squash(slot.subjectCode) || squash(c.startTime) !== squash(slot.startTime)) return false;
      const branchOk = squash(c.branch) === squash(who.branch) || (squash(c.branch) === "CSE" && squash(who.branch) === "MNC");
      if (!branchOk) return false;
      if (!c.section || !who.section) return true;
      return normSection(c.branch, c.section) === normSection(who.branch, who.section);
    }) ?? null
  );
}

const cleanError = (e: any) => new Error(String(e?.message ?? "Couldn't save. Try again.").replace(/^.*?:\s*/, ""));

/** Saved by the server, which checks you teach this class (or are an admin). */
export async function saveClassChange(input: Omit<ClassChange, "id">): Promise<void> {
  try {
    await httpsCallable(functions, "classChangeSet")({ action: "save", ...input });
  } catch (e) {
    throw cleanError(e);
  }
}

export async function removeClassChange(id: string, change?: Omit<ClassChange, "id">): Promise<void> {
  try {
    await httpsCallable(functions, "classChangeSet")({ action: "remove", id, ...(change ?? {}) });
  } catch (e) {
    throw cleanError(e);
  }
}
