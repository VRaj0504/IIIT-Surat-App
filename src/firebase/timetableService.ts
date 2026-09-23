import { doc, collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firestore';
import { expandFaculty } from '../data/facultyLegend';

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

// Doc id scheme must match scripts/seed-timetable.mjs exactly: `${branch}-${semester}-${section}`.
function timetableDocId(branch: string, semester: number, section: string): string {
  return `${resolveTimetableBranch(branch)}-${semester}-${section}`;
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

// A faculty member's personal schedule isn't stored anywhere on its
// own — it's derived by scanning every section's timetable for slots
// where the faculty field (once expanded via expandFaculty) matches
// their name. Deliberately NOT a separate upload: a section's
// timetable is the one source of truth for who teaches what and when,
// so deriving from it means a faculty member's schedule can never
// drift out of sync with what students actually see — there's nothing
// second to keep in sync. Each entry carries the section it came from,
// since a faculty member's own schedule spans multiple sections that a
// single TimetableSlot alone doesn't identify.
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
  const target = facultyName.trim().toLowerCase();
  return onSnapshot(collection(db, TIMETABLE_COLLECTION), (snap) => {
    const entries: FacultyScheduleEntry[] = [];
    snap.docs.forEach((docSnap) => {
      const tt = docSnap.data() as Timetable;
      tt.days.forEach((day) => {
        day.slots.forEach((slot) => {
          const names = expandFaculty(slot.faculty)
            .split('/')
            .map((n) => n.trim().toLowerCase());
          if (names.includes(target)) {
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
  });
}
