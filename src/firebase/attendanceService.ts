import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "./functionsClient";
import { getApprovedExcusalRanges, isDateWithinExcusal } from "./eventExcusalService";

const COLLECTION = "attendanceSessions";

export type AttendanceSession = {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  subjectName: string;
  date: string;
  absentEnrollmentNumbers: string[];

  lecture?: number;
  semester?: number;
  specialization?: string | null;
  excusedEnrollmentNumbers?: string[];
  hours?: number;
  kind?: "lecture" | "lab";
  onlyEnrollmentNumbers?: string[];
  batchLabel?: string;
  markedBy: string;
  markedAt: any;
};

function sessionDocId(params: {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  date: string;
  lecture?: number;
}): string {
  const base = `${params.branch}_${params.admissionYear}_${params.section || "NONE"}_${params.subjectCode.replace(/\//g, "-")}_${params.date}`;
  return params.lecture && params.lecture > 1 ? `${base}_L${params.lecture}` : base;
}

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
  lecture?: number;
  classSize?: number;
}): Promise<void> {
  const id = sessionDocId(params);

  const prev = await getDoc(doc(db, COLLECTION, id));
  const prevData = prev.exists() ? (prev.data() as AttendanceSession) : null;
  const excused = (prevData?.excusedEnrollmentNumbers ?? []).filter((r) => !params.absentEnrollmentNumbers.includes(r));

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
    lecture: params.lecture ?? 1,
    ...(params.classSize ? { classSize: params.classSize } : {}),
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

export async function getExistingSession(params: {
  branch: string;
  admissionYear: number;
  section: string | null;
  subjectCode: string;
  date: string;
  lecture?: number;
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
  percentage: number;

  canMiss: number;
  needToAttend: number;
  lastClass: string | null;
};

export const ATTENDANCE_TARGET = 75;

function slack(present: number, total: number) {
  const t = ATTENDANCE_TARGET / 100;

  const canMiss = Math.max(0, Math.floor(present / t - total + 1e-9));

  const needToAttend = present / Math.max(total, 1) >= t ? 0 : Math.ceil((t * total - present) / (1 - t) - 1e-9);
  return { canMiss, needToAttend };
}

type MySessionRow = Omit<AttendanceSession, "absentEnrollmentNumbers" | "excusedEnrollmentNumbers"> & {
  absent: boolean;
  excused: boolean;
};
const SESSIONS_TTL_MS = 90 * 1000;
const sessionCache = new Map<string, { at: number; p: Promise<MySessionRow[]> }>();

function fetchMySessions(key: string, force: boolean): Promise<MySessionRow[]> {
  const hit = sessionCache.get(key);
  if (!force && hit && Date.now() - hit.at < SESSIONS_TTL_MS) return hit.p;
  const call = httpsCallable<void, { sessions: MySessionRow[] }>(functions, "getMyAttendanceSessions");
  const p = call().then((r) => r.data.sessions);
  sessionCache.set(key, { at: Date.now(), p });
  p.catch(() => sessionCache.delete(key));
  return p;
}

export async function getMyAttendance(params: {
  enrollmentNumber: string;
  branch: string;
  admissionYear: number;
  section: string | null;
  specialization?: string | null;
  semester: number;
  subjects: { code: string; name: string }[];
  medicalExcusedSessions?: Set<string>;
  force?: boolean;
}): Promise<SubjectAttendance[]> {
  const [mySessions, excusalRanges] = await Promise.all([
    fetchMySessions(params.enrollmentNumber, !!params.force),
    getApprovedExcusalRanges(params.enrollmentNumber),
  ]);
  const snap = mySessions.map((x): AttendanceSession => {
    const { absent, excused, ...rest } = x;
    return {
      ...rest,
      absentEnrollmentNumbers: absent ? [params.enrollmentNumber] : [],
      excusedEnrollmentNumbers: excused ? [params.enrollmentNumber] : [],
    };
  });
  const norm = (c: string) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
  const semCodes = new Map(params.subjects.map((s) => [norm(s.code), s]));

  const bySubject = new Map<string, { code: string; name: string; total: number; present: number; last: string | null }>();
  snap.forEach((d) => {
    const key = norm(d.subjectCode);
    const thisSem = d.semester !== undefined ? d.semester === params.semester : semCodes.has(key);
    if (!thisSem) return;
    if (d.specialization && d.specialization !== params.specialization) return;

    if (d.onlyEnrollmentNumbers?.length && !d.onlyEnrollmentNumbers.includes(params.enrollmentNumber)) return;
    const w = Math.max(1, Math.round(d.hours ?? 1));

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
      params.medicalExcusedSessions?.has(`${d.subjectCode}|${d.date}`) ||
      params.medicalExcusedSessions?.has(`*|${d.date}`);
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
