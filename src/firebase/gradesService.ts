import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

// IIIT Surat's actual relative-grading scale (confirmed against the real
// convention used at IITs/IIITs: AA/AB/BB/BC/CC/CD/DD/FF, not a generic
// O/A+/A/... scale). Kept identical to CGPACalculatorScreen's own copy so
// a student's official transcript and their own what-if calculator always
// agree on what a grade is worth.
export const GRADE_POINTS: Record<string, number> = {
  AA: 10,
  AB: 9,
  BB: 8,
  BC: 7,
  CC: 6,
  CD: 5,
  DD: 4,
  FF: 0,
};
export const GRADES = Object.keys(GRADE_POINTS);

export type GradeEntry = {
  id: string;
  studentEnrollmentNumber: string;
  studentName: string;
  studentUid: string | null;
  branch: string;
  section: string | null;
  admissionYear: number;
  subjectCode: string;
  subjectName: string;
  subjectSemester: number;
  credits: number;
  grade: string;
  enteredBy: string;
  enteredByName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

const COLLECTION = "grades";

// One grade per (student, subject) — re-entering for the same pair
// overwrites rather than duplicating, so correcting a mistake is just
// "enter it again" instead of needing a separate edit flow.
function gradeDocId(enrollmentNumber: string, subjectCode: string): string {
  return `${enrollmentNumber}_${subjectCode}`;
}

export async function setGrade(params: {
  studentEnrollmentNumber: string;
  studentName: string;
  studentUid: string | null;
  branch: string;
  section: string | null;
  admissionYear: number;
  subjectCode: string;
  subjectName: string;
  subjectSemester: number;
  credits: number;
  grade: string;
  enteredBy: string;
  enteredByName: string;
}): Promise<void> {
  const id = gradeDocId(params.studentEnrollmentNumber, params.subjectCode);
  const existing = await getDoc(doc(db, COLLECTION, id));
  await setDoc(
    doc(db, COLLECTION, id),
    {
      studentEnrollmentNumber: params.studentEnrollmentNumber,
      studentName: params.studentName,
      studentUid: params.studentUid,
      branch: params.branch,
      section: params.section,
      admissionYear: params.admissionYear,
      subjectCode: params.subjectCode,
      subjectName: params.subjectName,
      subjectSemester: params.subjectSemester,
      credits: params.credits,
      grade: params.grade,
      enteredBy: params.enteredBy,
      enteredByName: params.enteredByName,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// A roster student, minimal shape needed for the grading list.
export type RosterStudent = { enrollmentNumber: string; name: string; uid?: string | null; specialization?: string };

// Reuses the same "fetch by admissionYear, filter client-side" approach as
// announcementsService.getClassOptionsForYear — a single equality query
// needs no composite index, and a class roster is small enough (tens of
// students) that client-side filtering is instant. Pass `specialization`
// to narrow further within a mixed section (e.g. only the AI/ML students
// in CSE B) — omit it to get everyone in the section regardless of
// specialization, which is correct for a subject the whole section takes
// together.
export async function getClassRoster(
  admissionYear: number,
  branch: string,
  section: string | null,
  specialization?: string | null,
): Promise<RosterStudent[]> {
  const snap = await getDocs(query(collection(db, "roster"), where("admissionYear", "==", admissionYear)));
  return snap.docs
    .map((d) => ({ regNo: d.id, ...(d.data() as { name: string; branch: string; section?: string; specialization?: string }) }))
    .filter((r) => r.branch === branch && (section ? r.section === section : true))
    .filter((r) => (specialization ? r.specialization === specialization : true))
    .map((r) => ({ enrollmentNumber: r.regNo, name: r.name, specialization: r.specialization }))
    .sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));
}

// Existing grades for a specific class+subject, keyed by enrollment number
// — lets the grading screen show what's already entered (and pre-fill it)
// rather than starting blank every time. One getDoc per roster student by
// its deterministic ID; fine for a class-sized list, and avoids needing a
// composite index for a where(branch)+where(section)+where(subjectCode)
// query just to check existing entries.
export async function getExistingGrades(
  roster: RosterStudent[],
  subjectCode: string,
): Promise<Map<string, GradeEntry>> {
  const results = await Promise.all(
    roster.map(async (r) => {
      const snap = await getDoc(doc(db, COLLECTION, gradeDocId(r.enrollmentNumber, subjectCode)));
      return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<GradeEntry, "id">) }) : null;
    }),
  );
  const map = new Map<string, GradeEntry>();
  results.forEach((g) => {
    if (g) map.set(g.studentEnrollmentNumber, g);
  });
  return map;
}

// A student's complete official transcript — every grade ever entered for
// them, live. Matched by enrollment number (not uid), the same reasoning
// as leaveApplications matching by email: grades can exist before a
// student has ever signed into the app.
export function subscribeToMyGrades(
  enrollmentNumber: string,
  onUpdate: (grades: GradeEntry[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where("studentEnrollmentNumber", "==", enrollmentNumber));
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GradeEntry, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[gradesService] subscribeToMyGrades error:", err);
    },
  );
}

export type SemesterResult = { semester: number; sgpa: number; credits: number };
export type Transcript = { semesters: SemesterResult[]; cgpa: number | null; totalCredits: number };

// Groups grades by their subject's curriculum semester, computes each
// semester's credit-weighted SGPA, then the overall credit-weighted CGPA
// across every semester with at least one grade — same weighting formula
// as the self-service calculator, just driven by real entered grades
// instead of manually typed SGPA/credit pairs.
export function computeTranscript(grades: GradeEntry[]): Transcript {
  const bySemester = new Map<number, GradeEntry[]>();
  for (const g of grades) {
    const list = bySemester.get(g.subjectSemester) ?? [];
    list.push(g);
    bySemester.set(g.subjectSemester, list);
  }

  const semesters: SemesterResult[] = Array.from(bySemester.entries())
    .map(([semester, gs]) => {
      const totalCredits = gs.reduce((sum, g) => sum + g.credits, 0);
      const totalPoints = gs.reduce((sum, g) => sum + g.credits * (GRADE_POINTS[g.grade] ?? 0), 0);
      return { semester, sgpa: totalCredits > 0 ? totalPoints / totalCredits : 0, credits: totalCredits };
    })
    .sort((a, b) => a.semester - b.semester);

  const totalCredits = semesters.reduce((sum, s) => sum + s.credits, 0);
  const totalPoints = semesters.reduce((sum, s) => sum + s.sgpa * s.credits, 0);
  const cgpa = totalCredits > 0 ? totalPoints / totalCredits : null;

  return { semesters, cgpa, totalCredits };
}
