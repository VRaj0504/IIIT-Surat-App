import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";

export type MarkComponent = { label: string; max: number; score: number | null; absent: boolean; updatedAt?: Timestamp | null };

export type SubjectMarks = {
  id: string;
  enrollmentNumber: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  components: Record<string, MarkComponent>;
  updatedAt: Timestamp | null;
};

const ORDER = ["quiz-1", "quiz-2", "quiz-3", "mid-sem", "assignment", "lab", "attendance", "end-sem"];

const rank = (id: string) => {
  const i = ORDER.indexOf(id);
  return i < 0 ? 98 : i;
};

export function orderedComponents(m: SubjectMarks): (MarkComponent & { id: string })[] {
  return Object.entries(m.components ?? {})
    .map(([id, c]) => ({ ...c, id }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
}

export function subscribeToMyMarks(enrollmentNumber: string, onUpdate: (items: SubjectMarks[]) => void): () => void {
  const q = query(collection(db, "marks"), where("enrollmentNumber", "==", enrollmentNumber.toUpperCase()));
  return persisted(
    `marks:${enrollmentNumber}`,
    (onUpdate, fail) =>
      onSnapshot(
        q,
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<SubjectMarks, "id">) }))
            .sort((a, b) => b.semester - a.semester || a.subjectCode.localeCompare(b.subjectCode));
          onUpdate(items);
        },
        () => fail([]),
      ),
    onUpdate,
  );
}
