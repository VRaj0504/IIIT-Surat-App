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
import { persisted } from './liveCache';
import { LETTER_GRADES, summariseSemesters, computeCgpa, type AttemptType } from "../utils/examRules";

export { GRADE_POINTS, SPECIAL_GRADES, GRADE_LABELS, ATTEMPT_TYPES, ATTEMPT_LABELS } from "../utils/examRules";
export const GRADES: string[] = [...LETTER_GRADES];

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
  attempt?: AttemptType | null;
  history?: { grade: string; attempt?: string | null; enteredByName?: string | null; changedAt?: Timestamp | null }[] | null;
  enteredBy: string;
  enteredByName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

const COLLECTION = "grades";

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
  attempt?: AttemptType;
  enteredBy: string;
  enteredByName: string;
}): Promise<void> {
  const id = gradeDocId(params.studentEnrollmentNumber, params.subjectCode);
  const existing = await getDoc(doc(db, COLLECTION, id));
  const attempt: AttemptType = params.attempt ?? "regular";
  const prev = existing.exists() ? (existing.data() as Partial<GradeEntry>) : null;
  const history = [...(prev?.history ?? [])];
  const prevAttempt = prev?.attempt ?? "regular";
  if (prev?.grade && prev.grade !== params.grade && attempt !== prevAttempt) {
    history.push({
      grade: prev.grade,
      attempt: prevAttempt,
      enteredByName: prev.enteredByName ?? null,
      changedAt: Timestamp.now(),
    });
  }
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
      attempt,
      history,
      enteredBy: params.enteredBy,
      enteredByName: params.enteredByName,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type RosterStudent = { enrollmentNumber: string; name: string; uid?: string | null; specialization?: string };

export async function getClassRoster(
  admissionYear: number,
  branch: string,
  section: string | null,
  specialization?: string | null,
): Promise<RosterStudent[]> {
  const snap = await getDocs(query(collection(db, "roster"), where("admissionYear", "==", admissionYear)));
  return snap.docs
    .map((d) => ({ regNo: d.id, ...(d.data() as { name: string; branch: string; section?: string; specialization?: string; reviewer?: boolean }) }))
    .filter((r) => !r.reviewer)
    .filter((r) => r.branch === branch && (section ? r.section === section : true))
    .filter((r) => (specialization ? r.specialization === specialization : true))
    .map((r) => ({ enrollmentNumber: r.regNo, name: r.name, specialization: r.specialization }))
    .sort((a, b) => a.enrollmentNumber.localeCompare(b.enrollmentNumber));
}

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

export function subscribeToMyGrades(
  enrollmentNumber: string,
  onUpdate: (grades: GradeEntry[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where("studentEnrollmentNumber", "==", enrollmentNumber));
  return persisted(`grades:${enrollmentNumber}`, (onUpdate) => onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GradeEntry, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[gradesService] subscribeToMyGrades error:", err);
    },
  ), onUpdate);
}

export type SemesterResult = { semester: number; sgpa: number; credits: number };
export type Transcript = { semesters: SemesterResult[]; cgpa: number | null; totalCredits: number };

export function computeTranscript(grades: GradeEntry[]): Transcript {
  const semesters = summariseSemesters(grades).map((s) => ({
    semester: s.semester,
    sgpa: s.sgpa ?? 0,
    credits: s.registeredCredits,
  }));
  const totalCredits = summariseSemesters(grades).reduce((sum, s) => sum + s.earnedCredits, 0);
  return { semesters, cgpa: computeCgpa(grades), totalCredits };
}
