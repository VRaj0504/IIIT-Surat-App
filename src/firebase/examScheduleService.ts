import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firestore";

// One doc per branch + semester + exam type, id `${branch}-${semester}-${examType}`
// (written by the faculty web portal's Exam Schedule tab — the id scheme
// there and the query below must stay in step). A student reads every
// exam type published for their own branch + semester in one query.
export type ExamEntry = {
  date: string; // YYYY-MM-DD, a plain string on purpose — no timezone can move an exam to another day
  startTime: string; // HH:MM, 24h
  endTime: string; // HH:MM, 24h, "" if the sheet only gave a start time
  subjectCode: string;
  subjectName: string;
  venue: string;
};

export type ExamSchedule = {
  id: string;
  branch: string;
  semester: number;
  examType: string;
  examTypeLabel: string;
  entries: ExamEntry[];
  // The official date sheet as issued (PDF or photo), when one was attached
  // at publish time — lets a student check the original themselves.
  sourcePdfUrl?: string | null;
  sourcePdfName?: string | null;
  updatedAt: Timestamp | null;
};

// Display order: the way an academic term actually unfolds.
// "-repeaters" sheets are the separate date sheet for students repeating a
// course; they sit right after the regular sheet of the same exam.
const EXAM_TYPE_ORDER = ["quiz", "midsem", "midsem-repeaters", "endsem", "endsem-repeaters", "supplementary"];

// Same rule as timetableService.resolveTimetableBranch — MNC students read
// the CSE sheet, so faculty never have to publish the same date sheet twice.
function resolveBranch(branch: string): string {
  return branch.toUpperCase() === "MNC" ? "CSE" : branch;
}

export function subscribeToExamSchedules(
  branch: string,
  semester: number,
  onUpdate: (schedules: ExamSchedule[]) => void,
): () => void {
  // Two equality filters need no composite index.
  const q = query(
    collection(db, "examSchedules"),
    where("branch", "==", resolveBranch(branch)),
    where("semester", "==", semester),
  );
  return onSnapshot(
    q,
    (snap) => {
      const schedules = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamSchedule, "id">) }))
        .sort((a, b) => {
          const ai = EXAM_TYPE_ORDER.indexOf(a.examType);
          const bi = EXAM_TYPE_ORDER.indexOf(b.examType);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      onUpdate(schedules);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[examScheduleService] subscribeToExamSchedules error:", err);
      onUpdate([]);
    },
  );
}
