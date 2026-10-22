import { doc, collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firestore';
import { slotTaughtBy } from '../data/facultyLegend';
import { persisted } from './liveCache';

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

function resolveTimetableBranch(branch: string): string {
  return branch.toUpperCase() === 'MNC' ? 'CSE' : branch;
}

function timetableDocId(branch: string, semester: number, section: string): string {
  return `${resolveTimetableBranch(branch)}-${semester}-${section}`;
}

export function subscribeToTimetable(
  branch: string,
  semester: number,
  section: string,
  onUpdate: (timetable: Timetable | null) => void
): () => void {
  const docId = timetableDocId(branch, semester, section);
  return persisted(`tt:${docId}`, (onUpdate) => onSnapshot(doc(db, TIMETABLE_COLLECTION, docId), (docSnap) => {
    if (!docSnap.exists()) {
      onUpdate(null);
      return;
    }
    onUpdate(docSnap.data() as Timetable);
  }), onUpdate);
}

export type FacultyScheduleEntry = TimetableSlot & {
  branch: string;
  semester: number;
  section: string;
  day: string;
};

export function subscribeToFacultyTimetable(
  facultyName: string,
  onUpdate: (entries: FacultyScheduleEntry[]) => void
): () => void {
  return persisted(`ftt:${facultyName}`, (onUpdate) => onSnapshot(collection(db, TIMETABLE_COLLECTION), (snap) => {
    const entries: FacultyScheduleEntry[] = [];
    snap.docs.forEach((docSnap) => {
      const tt = docSnap.data() as Timetable;
      (tt.days ?? []).forEach((day) => {
        (day.slots ?? []).forEach((slot) => {
          if (slotTaughtBy(slot.faculty, facultyName)) {
            entries.push({
              ...slot,
              branch: tt.branch,
              semester: tt.semester,
              section: tt.section,
              day: day.day,
            });
          }
        });
      });
    });
    onUpdate(entries);
  }), onUpdate);
}

export function subscribeToAllTimetables(
  onUpdate: (timetables: Timetable[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return persisted('tt:all', (onUpdate) => onSnapshot(
    collection(db, TIMETABLE_COLLECTION),
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as Timetable));
    },
    (error) => {
      console.warn('subscribeToAllTimetables failed:', error);
      onError?.(error);
    },
  ), onUpdate);
}
