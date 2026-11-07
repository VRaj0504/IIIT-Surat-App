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
  guidelines?: string[] | null;
  takers?: Record<string, string[]> | null;
  students?: string[] | null;
  updatedAt: Timestamp | null;
};

export function isRestricted(s: ExamSchedule): boolean {
  return !!s.takers && Object.values(s.takers).some((l) => Array.isArray(l) && l.length > 0);
}

export function entriesFor(s: ExamSchedule, regNo: string | null | undefined): ExamEntry[] {
  if (!isRestricted(s)) return s.entries;
  const me = String(regNo ?? "").trim().toUpperCase();
  if (!me) return [];
  return s.entries.filter((e) => (s.takers?.[e.subjectCode.trim().toUpperCase()] ?? []).includes(me));
}

const EXAM_TYPE_ORDER = ["quiz", "midsem", "midsem-repeaters", "endsem", "endsem-repeaters", "supplementary"];

const isMnc = (branch: string) => branch.toUpperCase() === "MNC";

export function subscribeToExamSchedules(
  branch: string,
  semester: number,
  regNo: string | null | undefined,
  onUpdate: (schedules: ExamSchedule[]) => void,
): () => void {
  const me = String(regNo ?? "").trim().toUpperCase();
  const bySemester = query(
    collection(db, "examSchedules"),
    where("branch", "in", isMnc(branch) ? ["MNC", "CSE"] : [branch]),
    where("semester", "==", semester),
  );
  const byName = me ? query(collection(db, "examSchedules"), where("students", "array-contains", me)) : null;

  return persisted(`exams:${branch}:${semester}:${me}`, (emit) => {
    let a: ExamSchedule[] | null = null;
    let b: ExamSchedule[] | null = byName ? null : [];
    const flush = () => {
      if (a === null || b === null) return;
      const own = new Set(a.filter((s) => s.branch === "MNC").map((s) => s.examType));
      const fromSem = a.filter((s) => !isMnc(branch) || s.branch === "MNC" || !own.has(s.examType));
      const merged = new Map<string, ExamSchedule>();
      for (const s of [...fromSem, ...b]) merged.set(s.id, s);
      const list = Array.from(merged.values())
        .map((s) => (isRestricted(s) ? { ...s, entries: entriesFor(s, me) } : s))
        .filter((s) => s.entries.length > 0 || (!isRestricted(s) && !!s.sourcePdfUrl))
        .sort((x, y) => {
          const xi = EXAM_TYPE_ORDER.indexOf(x.examType);
          const yi = EXAM_TYPE_ORDER.indexOf(y.examType);
          return (xi === -1 ? 99 : xi) - (yi === -1 ? 99 : yi);
        });
      emit(list);
    };
    const read = (snap: { docs: { id: string; data: () => unknown }[] }) =>
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamSchedule, "id">) }));
    const fail = (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[examScheduleService] subscribeToExamSchedules error:", err);
    };
    const u1 = onSnapshot(bySemester, (snap) => { a = read(snap); flush(); }, (err) => { fail(err); a = []; flush(); });
    const u2 = byName
      ? onSnapshot(byName, (snap) => { b = read(snap); flush(); }, (err) => { fail(err); b = []; flush(); })
      : () => {};
    return () => {
      u1();
      u2();
    };
  }, onUpdate);
}
