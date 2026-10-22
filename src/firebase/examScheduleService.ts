import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from './liveCache';

export type ExamEntry = {
  date: string;
  startTime: string;
  endTime: string;
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

  sourcePdfUrl?: string | null;
  sourcePdfName?: string | null;
  updatedAt: Timestamp | null;
};

const EXAM_TYPE_ORDER = ["quiz", "midsem", "midsem-repeaters", "endsem", "endsem-repeaters", "supplementary"];

const isMnc = (branch: string) => branch.toUpperCase() === "MNC";

export function subscribeToExamSchedules(
  branch: string,
  semester: number,
  onUpdate: (schedules: ExamSchedule[]) => void,
): () => void {

  const q = query(
    collection(db, "examSchedules"),
    where("branch", "in", isMnc(branch) ? ["MNC", "CSE"] : [branch]),
    where("semester", "==", semester),
  );
  return persisted(`exams:${branch}:${semester}`, (onUpdate) => onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamSchedule, "id">) }));

      const ownTypes = new Set(all.filter((s) => s.branch === "MNC").map((s) => s.examType));
      const schedules = all
        .filter((s) => !isMnc(branch) || s.branch === "MNC" || !ownTypes.has(s.examType))
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
  ), onUpdate);
}
