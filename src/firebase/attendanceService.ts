import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firestore";
import { getApprovedExcusalRanges, isDateWithinExcusal } from "./eventExcusalService";

const COLLECTION = "attendanceSessions";

// One document per (class, subject, date) — storing only who was ABSENT,
// not a per-student doc for everyone present. Matches the actual faculty
// workflow (mark the few exceptions, not every name), and keeps writes
// small regardless of class size.
export type AttendanceSession = {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  subjectName: string;
  date: string; // "YYYY-MM-DD"
  absentEnrollmentNumbers: string[];
  // Optional fields written by the faculty portal (older docs lack them):
  lecture?: number; // 2 = second class of this subject that day
  semester?: number;
  specialization?: string | null; // only these students take it
  excusedEnrollmentNumbers?: string[]; // on duty / leave — counts as attended
  hours?: number; // a 2-hour lab counts as 2
  kind?: "lecture" | "lab";
  onlyEnrollmentNumbers?: string[]; // one lab batch: only these students
  batchLabel?: string;
  markedBy: string; // faculty uid
  markedAt: any;
};

function sessionDocId(params: {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  date: string;
}): string {
  return `${params.branch}_${params.admissionYear}_${params.section ?? "NONE"}_${params.subjectCode}_${params.date}`;
}

// Faculty side — records one class session's attendance. Re-marking the
// same (class, subject, date) combination overwrites the previous
// record entirely, same as re-entering a grade overwrites the old one
// elsewhere in this app — there's one true record per session, not a
// history of edits.
export async function markAttendance(params: {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  subjectName: string;
  date: string;
  absentEnrollmentNumbers: string[];
  markedBy: string;
  markedByName?: string;
  semester?: number;
  specialization?: string | null;
}): Promise<void> {
  const id = sessionDocId(params);
  // Keep on-duty marks made on the portal, except for anyone now marked absent.
  const prev = await getDoc(doc(db, COLLECTION, id));
  const prevData = prev.exists() ? (prev.data() as AttendanceSession) : null;
  const excused = (prevData?.excusedEnrollmentNumbers ?? []).filter((r) => !params.absentEnrollmentNumbers.includes(r));
  // Keep lab details set on the portal (length, which batch).
  const lab = {
    ...(prevData?.hours ? { hours: prevData.hours } : {}),
    ...(prevData?.kind ? { kind: prevData.kind } : {}),
    ...(prevData?.onlyEnrollmentNumbers?.length ? { onlyEnrollmentNumbers: prevData.onlyEnrollmentNumbers } : {}),
    ...(prevData?.batchLabel ? { batchLabel: prevData.batchLabel } : {}),
  };
  await setDoc(doc(db, COLLECTION, id), {
    branch: params.branch,
    admissionYear: params.admissionYear,
    section: params.section,
    subjectCode: params.subjectCode,
    subjectName: params.subjectName,
    date: params.date,
    lecture: 1,
    ...(params.semester ? { semester: params.semester } : {}),
    specialization: params.specialization ?? null,
    absentEnrollmentNumbers: params.absentEnrollmentNumbers,
    excusedEnrollmentNumbers: excused,
    ...lab,
    markedBy: params.markedBy,
    markedByName: params.markedByName ?? null,
    source: "app",
    markedAt: serverTimestamp(),
  });
}

// Loads whatever session already exists for this exact (class, subject,
// date) — lets the faculty screen pre-fill if they're re-opening a day
// they already marked, instead of starting blank and risking an
// accidental double-count.
export async function getExistingSession(params: {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  date: string;
}): Promise<string[] | null> {
  const id = sessionDocId(params);
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return (snap.data() as AttendanceSession).absentEnrollmentNumbers;
}

export type SubjectAttendance = {
  subjectCode: string;
  subjectName: string;
  totalSessions: number;
  presentCount: number;
  percentage: number; // 0-100, rounded to 1 decimal
  // Classes you can still miss and stay at 75% (0 if already below), or
  // classes in a row you need to attend to get back to 75%.
  canMiss: number;
  needToAttend: number;
  lastClass: string | null; // "YYYY-MM-DD"
};

export const ATTENDANCE_TARGET = 75;

function slack(present: number, total: number) {
  const t = ATTENDANCE_TARGET / 100;
  // largest k with present / (total + k) >= t
  const canMiss = Math.max(0, Math.floor(present / t - total + 1e-9));
  // smallest k with (present + k) / (total + k) >= t
  const needToAttend = present / Math.max(total, 1) >= t ? 0 : Math.ceil((t * total - present) / (1 - t) - 1e-9);
  return { canMiss, needToAttend };
}

// Student side — every class held for the student's own section this
// semester, grouped by subject (electives included). One query; the rules
// let a student read exactly their branch + year + section.
//   · OD / leave marked by the teacher, approved event excusals and
//     medical leaves confirmed by the teacher count as attended
//   · classes saved for another specialization don't count
//   · a class from an earlier semester doesn't count
export async function getMyAttendance(params: {
  enrollmentNumber: string;
  branch: string;
  admissionYear: number;
  section: string | null;
  specialization?: string | null;
  semester: number;
  subjects: { code: string; name: string }[]; // this semester's curriculum
  medicalExcusedSessions?: Set<string>; // "CS304|2026-10-19"
}): Promise<SubjectAttendance[]> {
  const q = query(
    collection(db, COLLECTION),
    where("branch", "==", params.branch),
    where("admissionYear", "==", params.admissionYear),
    where("section", "==", params.section),
  );
  const [snap, excusalRanges] = await Promise.all([getDocs(q), getApprovedExcusalRanges(params.enrollmentNumber)]);
  const norm = (c: string) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
  const semCodes = new Map(params.subjects.map((s) => [norm(s.code), s]));

  const bySubject = new Map<string, { code: string; name: string; total: number; present: number; last: string | null }>();
  snap.forEach((docSnap) => {
    const d = docSnap.data() as AttendanceSession;
    const key = norm(d.subjectCode);
    const thisSem = d.semester !== undefined ? d.semester === params.semester : semCodes.has(key);
    if (!thisSem) return;
    if (d.specialization && d.specialization !== params.specialization) return;
    // A lab batch I'm not in isn't my class.
    if (d.onlyEnrollmentNumbers?.length && !d.onlyEnrollmentNumbers.includes(params.enrollmentNumber)) return;
    const w = Math.max(1, Math.round(d.hours ?? 1)); // a 2-hour lab counts as 2

    const entry = bySubject.get(key) ?? {
      code: semCodes.get(key)?.code ?? d.subjectCode,
      name: semCodes.get(key)?.name ?? d.subjectName,
      total: 0,
      present: 0,
      last: null,
    };
    entry.total += w;
    const absent = d.absentEnrollmentNumbers.includes(params.enrollmentNumber);
    const excused =
      d.excusedEnrollmentNumbers?.includes(params.enrollmentNumber) ||
      isDateWithinExcusal(d.date, excusalRanges) ||
      params.medicalExcusedSessions?.has(`${d.subjectCode}|${d.date}`);
    if (!absent || excused) entry.present += w;
    if (!entry.last || d.date > entry.last) entry.last = d.date;
    bySubject.set(key, entry);
  });

  return Array.from(bySubject.values())
    .map((e) => ({
      subjectCode: e.code,
      subjectName: e.name,
      totalSessions: e.total,
      presentCount: e.present,
      percentage: Math.round((e.present / e.total) * 1000) / 10,
      lastClass: e.last,
      ...slack(e.present, e.total),
    }))
    .sort((a, b) => a.percentage - b.percentage || a.subjectCode.localeCompare(b.subjectCode));
}
