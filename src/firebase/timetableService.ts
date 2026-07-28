import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firestore';

export type TimetableSlot = {
  id: string;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  faculty: string;
  room: string;
  group?: string;
};

export type TimetableDay = {
  day: string;
  slots: TimetableSlot[];
};

export type Timetable = {
  branch: string;
  semester: number;
  section: string;
  days: TimetableDay[];
  updatedAt: Timestamp | null;
};

const TIMETABLE_COLLECTION = 'timetable';

// Doc id scheme must match scripts/seed-timetable.mjs exactly: `${branch}-${semester}-${section}`.
function timetableDocId(branch: string, semester: number, section: string): string {
  return `${branch}-${semester}-${section}`;
}

// Subscribes to a single section's timetable doc. Calls onUpdate(null) if no
// timetable has been uploaded yet for that branch/semester/section.
export function subscribeToTimetable(
  branch: string,
  semester: number,
  section: string,
  onUpdate: (timetable: Timetable | null) => void
): () => void {
  const docId = timetableDocId(branch, semester, section);
  return onSnapshot(doc(db, TIMETABLE_COLLECTION, docId), (docSnap) => {
    if (!docSnap.exists()) {
      onUpdate(null);
      return;
    }
    onUpdate(docSnap.data() as Timetable);
  });
}
