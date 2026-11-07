import {
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "./firestore";
import { functions } from "./functionsClient";
import type { Club } from "./clubsService";
import type { SignatureVector } from "./medicalService";

const EXCUSALS_COLLECTION = "eventExcusals";

export const EXCUSAL_CATEGORIES = ["Sports", "Cultural", "Technical", "Fest", "Competition", "Other"] as const;
export type ExcusalCategory = (typeof EXCUSAL_CATEGORIES)[number];

export type ExcusalStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ExcusalStage = "fic" | "dsw" | "dean" | "approved" | "rejected" | "withdrawn";
export type SignStep = "fic" | "dsw" | "dean";
export const SIGN_STEPS: SignStep[] = ["fic", "dsw", "dean"];
export const STEP_TITLE: Record<SignStep, string> = {
  fic: "Faculty in-charge",
  dsw: "Dean, Student Welfare",
  dean: "Dean, Academics",
};
export const STEP_SHORT: Record<SignStep, string> = { fic: "FIC", dsw: "DSW", dean: "Dean" };

type Person = { name: string; email: string };
export type ExcusalStudent = { regNo: string; name: string; branch: string; section: string | null; admissionYear: number | null; classKey: string | null };
export type ExcusalSign = { name: string; email: string; at: Timestamp; remark: string | null; signature: SignatureVector | null };
export type ExcusalEvent = { at: Timestamp; byName: string; byEmail: string; action: string; remark: string | null };

export type EventExcusal = {
  id: string;
  flow?: number;
  eventName: string;
  category?: ExcusalCategory;
  fromDate: string;
  toDate: string;
  fullDay?: boolean;
  fromTime?: string | null;
  toTime?: string | null;
  clubId?: string;
  clubName?: string;
  parentClubId?: string;
  parentClubName?: string;
  students?: ExcusalStudent[];
  sessionsByClass?: Record<string, string[]> | null;
  studentEnrollmentNumbers: string[];
  approvers?: Record<SignStep, Person>;
  approverEmails?: string[];
  stage?: ExcusalStage;
  currentApproverEmail?: string | null;
  /** Everyone who can sign the current step (a club can have several FICs; any one signs). */
  currentApproverEmails?: string[];
  signatures?: Partial<Record<SignStep, ExcusalSign>>;
  history?: ExcusalEvent[];
  rejectedReason?: string | null;
  facultyCoordinatorUid: string | null;
  facultyCoordinatorName: string;
  facultyCoordinatorEmail: string;
  submittedBy: string;
  submittedByName: string;
  status: ExcusalStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  respondedAt: Timestamp | null;
};

const toList = (snap: { docs: { id: string; data: () => unknown }[] }) =>
  snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<EventExcusal, "id">) }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));

export function canSignNow(x: EventExcusal, email: string): boolean {
  if (x.status !== "pending") return false;
  const e = email.toLowerCase();
  const list = x.currentApproverEmails?.length ? x.currentApproverEmails : x.currentApproverEmail ? [x.currentApproverEmail] : [];
  return list.map((v) => v.toLowerCase()).includes(e);
}

/** Clubs this person leads (any club or sub-club). */
export function clubsLedBy(clubs: Club[], uid: string, email: string): Club[] {
  const e = email.toLowerCase();
  return clubs.filter(
    (c) => c.leadUid === uid || (c.leadEmail ?? "").toLowerCase() === e || (c.additionalLeadEmails ?? []).map((x) => x.toLowerCase()).includes(e),
  );
}

export type ExcusalInput = {
  excusalId?: string;
  clubId: string;
  eventName: string;
  category: ExcusalCategory;
  fromDate: string;
  toDate: string;
  fullDay: boolean;
  fromTime?: string | null;
  toTime?: string | null;
  students: string[];
  linkedEventId?: string | null;
};

const cleanError = (e: any) => new Error(String(e?.message ?? "Something went wrong.").replace(/^.*?:\s*/, ""));

export async function submitExcusal(input: ExcusalInput): Promise<{ id: string; timedClasses: number | null }> {
  try {
    const r = await httpsCallable<ExcusalInput, { id: string; timedClasses: number | null }>(functions, "excusalSubmit")(input);
    return { id: r.data.id, timedClasses: r.data.timedClasses ?? null };
  } catch (e) {
    throw cleanError(e);
  }
}

export async function actOnExcusal(p: { excusalId: string; action: "sign" | "reject"; signature?: SignatureVector | null; saveSignature?: boolean; remark?: string }): Promise<void> {
  try {
    await httpsCallable(functions, "excusalAct")(p);
  } catch (e) {
    throw cleanError(e);
  }
}

export async function withdrawExcusal(excusalId: string): Promise<void> {
  try {
    await httpsCallable(functions, "excusalWithdraw")({ excusalId });
  } catch (e) {
    throw cleanError(e);
  }
}

export function subscribeToMySubmittedExcusals(submittedBy: string, onUpdate: (excusals: EventExcusal[]) => void): () => void {
  const q = query(collection(db, EXCUSALS_COLLECTION), where("submittedBy", "==", submittedBy));
  return onSnapshot(q, (snap) => onUpdate(toList(snap)), () => onUpdate([]));
}

/** Requests where this person is one of the three signers. */
export function subscribeToSignerExcusals(email: string, onUpdate: (excusals: EventExcusal[]) => void): () => void {
  const q = query(collection(db, EXCUSALS_COLLECTION), where("approverEmails", "array-contains", email.toLowerCase()));
  return onSnapshot(q, (snap) => onUpdate(toList(snap)), () => onUpdate([]));
}

/** Old one-faculty requests, so anything still pending there can be finished. */
export function subscribeToAssignedExcusals(facultyCoordinatorUid: string, onUpdate: (excusals: EventExcusal[]) => void): () => void {
  const q = query(collection(db, EXCUSALS_COLLECTION), where("facultyCoordinatorUid", "==", facultyCoordinatorUid));
  return onSnapshot(q, (snap) => onUpdate(toList(snap)), () => onUpdate([]));
}

export async function respondToExcusal(excusalId: string, status: "approved" | "rejected", remark: string | null): Promise<void> {
  await updateDoc(doc(db, EXCUSALS_COLLECTION, excusalId), { status, facultyRemark: remark, respondedAt: serverTimestamp() });
}

// ---- Attendance coverage ------------------------------------------------------

/** What one approved excusal covers for one student: whole days, or specific classes ("SUBJ|date"). */
export type ExcusalRange = { fromDate: string; toDate: string; eventName: string; sessions?: string[] };

const normCode = (c: string) => String(c ?? "").replace(/\s+/g, "").toUpperCase();

export function rangeFor(x: EventExcusal, regNo: string): ExcusalRange {
  const base = { fromDate: x.fromDate, toDate: x.toDate, eventName: x.eventName };
  if (x.flow !== 2 || x.fullDay !== false) return base;
  const key = x.students?.find((s) => s.regNo === regNo)?.classKey;
  return { ...base, sessions: (key && x.sessionsByClass?.[key]) || [] };
}

export function excusalCovers(r: ExcusalRange, date: string, subjectCode?: string): boolean {
  if (date < r.fromDate || date > r.toDate) return false;
  if (!r.sessions) return true;
  if (!subjectCode) return false;
  const want = `${normCode(subjectCode)}|${date}`;
  return r.sessions.some((k) => {
    const i = k.lastIndexOf("|");
    return `${normCode(k.slice(0, i))}|${k.slice(i + 1)}` === want;
  });
}

export async function getApprovedExcusalRanges(enrollmentNumber: string): Promise<ExcusalRange[]> {
  const q = query(
    collection(db, EXCUSALS_COLLECTION),
    where("studentEnrollmentNumbers", "array-contains", enrollmentNumber),
    where("status", "==", "approved"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => rangeFor({ id: d.id, ...(d.data() as Omit<EventExcusal, "id">) }, enrollmentNumber));
}

/** Kept for older callers: true if any range covers the date (whole-day check only). */
export function isDateWithinExcusal(date: string, ranges: { fromDate: string; toDate: string }[]): boolean {
  return ranges.some((r) => date >= r.fromDate && date <= r.toDate);
}

let approvedCache: { at: number; rows: EventExcusal[] } | null = null;

/** Approved excusals active on a date, for Mark Attendance (faculty can read approved ones). */
export async function getApprovedExcusalsOn(date: string): Promise<EventExcusal[]> {
  if (!approvedCache || Date.now() - approvedCache.at > 5 * 60 * 1000) {
    const snap = await getDocs(query(collection(db, EXCUSALS_COLLECTION), where("status", "==", "approved")));
    approvedCache = { at: Date.now(), rows: toList(snap) };
  }
  return approvedCache.rows.filter((x) => x.fromDate <= date && x.toDate >= date);
}

// ---- Students ---------------------------------------------------------------

export type RosterSearchResult = { regNo: string; name: string; branch?: string; section?: string | null };

let rosterCache: { at: number; rows: RosterSearchResult[] } | null = null;

async function roster(): Promise<RosterSearchResult[]> {
  if (!rosterCache || Date.now() - rosterCache.at > 10 * 60 * 1000) {
    const snap = await getDocs(collection(db, "roster"));
    rosterCache = {
      at: Date.now(),
      rows: snap.docs.map((d) => {
        const x = d.data() as { name: string; branch?: string; section?: string | null };
        return { regNo: d.id, name: x.name, branch: x.branch, section: x.section ?? null };
      }),
    };
  }
  return rosterCache.rows;
}

export async function searchWholeRoster(queryText: string): Promise<RosterSearchResult[]> {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return (await roster()).filter((r) => r.regNo.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)).slice(0, 20);
}

/** Turns pasted text (commas, spaces, new lines) into roster matches and the numbers that weren't found. */
export async function lookupPastedRegNos(text: string): Promise<{ found: RosterSearchResult[]; missing: string[] }> {
  const wanted = Array.from(new Set(text.toUpperCase().match(/[A-Z]{2}\d{2}[A-Z]{2,4}\d{2,4}/g) ?? []));
  const byReg = new Map((await roster()).map((r) => [r.regNo.toUpperCase(), r]));
  const found: RosterSearchResult[] = [];
  const missing: string[] = [];
  wanted.forEach((w) => {
    const r = byReg.get(w);
    if (r) found.push(r);
    else missing.push(w);
  });
  return { found, missing };
}
