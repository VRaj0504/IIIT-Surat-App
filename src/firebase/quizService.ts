import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";

export type QuizRoom = { room: string; fromRegNo: string; toRegNo: string };

export type Quiz = {
  id: string;
  title: string;
  subjectCode: string;
  subjectName: string;
  branch: string;
  admissionYear: number;
  sections: string[];
  date: string;
  startTime: string;
  endTime: string;
  syllabus: string;
  rooms: QuizRoom[];
  note?: string | null;
  createdByName?: string | null;
  updatedAt?: Timestamp | null;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function roomFor(quiz: Quiz, regNo: string | undefined): QuizRoom | null {
  if (!regNo) return null;
  const r = regNo.toUpperCase();
  return quiz.rooms.find((x) => r >= x.fromRegNo.toUpperCase() && r <= x.toRegNo.toUpperCase()) ?? null;
}

export function subscribeToMyQuizzes(
  params: { branch: string; admissionYear: number; section?: string | null },
  onUpdate: (quizzes: Quiz[]) => void,
): () => void {
  const q = query(
    collection(db, "quizzes"),
    where("branch", "==", params.branch),
    where("admissionYear", "==", params.admissionYear),
  );
  return persisted(`quizzes:${params.branch}:${params.admissionYear}:${params.section ?? ""}`, (emit, fail) =>
    onSnapshot(
      q,
      (snap) => {
        const today = todayIso();
        emit(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Quiz, "id">) }))
            .filter((x) => x.date >= today)
            .filter((x) => !x.sections?.length || !params.section || x.sections.includes(params.section))
            .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
        );
      },
      () => fail([]),
    ),
  onUpdate);
}
