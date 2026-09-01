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
}): Promise<void> {
  const id = sessionDocId(params);
  await setDoc(doc(db, COLLECTION, id), {
    branch: params.branch,
    admissionYear: params.admissionYear,
    section: params.section,
    subjectCode: params.subjectCode,
    subjectName: params.subjectName,
    date: params.date,
    absentEnrollmentNumbers: params.absentEnrollmentNumbers,
    markedBy: params.markedBy,
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
};

// Student side — computes attendance percentage per subject by fetching
// every session held for their class+subject and checking whether their
// enrollment number appears in each session's absentee list. Fine at the
// scale of a semester's worth of sessions (tens, not thousands); if this
// were tracking years of history it would need a different approach,
// but "how many days of THIS subject THIS semester" always stays small.
export async function getMyAttendance(params: {
  enrollmentNumber: string;
  branch: string;
  admissionYear: number;
  section: string | null;
  subjects: { code: string; name: string }[];
}): Promise<SubjectAttendance[]> {
  const results: SubjectAttendance[] = [];
  // Fetched once per student, not once per session — a student is
  // realistically covered by a handful of approved event excusals across
  // a whole semester at most, so this is far cheaper than checking per
  // date, and every subject's loop below reuses the same list.
  const excusalRanges = await getApprovedExcusalRanges(params.enrollmentNumber);

  for (const subject of params.subjects) {
    const q = query(
      collection(db, COLLECTION),
      where("branch", "==", params.branch),
      where("admissionYear", "==", params.admissionYear),
      where("section", "==", params.section),
      where("subjectCode", "==", subject.code),
    );
    const snap = await getDocs(q);
    const totalSessions = snap.size;
    if (totalSessions === 0) continue; // no classes held yet — nothing to show

    let absentCount = 0;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as AttendanceSession;
      const wasMarkedAbsent = data.absentEnrollmentNumbers.includes(params.enrollmentNumber);
      // An absence on a day covered by an APPROVED event excusal (inter-
      // IIIT events, hackathons, etc.) doesn't count against the
      // student — this is the whole point of the excusal workflow: the
      // faculty who marked attendance that day has no way to know in
      // advance who's representing the college elsewhere, so this
      // reconciles it after the fact rather than requiring every
      // faculty to manually re-edit past attendance records.
      if (wasMarkedAbsent && !isDateWithinExcusal(data.date, excusalRanges)) {
        absentCount++;
      }
    });

    const presentCount = totalSessions - absentCount;
    results.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      totalSessions,
      presentCount,
      percentage: Math.round((presentCount / totalSessions) * 1000) / 10,
    });
  }

  return results;
}
