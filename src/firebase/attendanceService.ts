import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';

export type AttendanceStatus = 'present' | 'absent';

export type Session = {
  id: string;
  subject: string;
  facultyId: string;
  facultyName: string;
  date: string; // ISO date, e.g. "2026-07-08"
  createdAt: Timestamp | null;
  finalized: boolean;
  records: Record<string, AttendanceStatus>; 
};

const SESSIONS_COLLECTION = 'sessions';

// Faculty starts a new session for a subject. Returns the new session's id.
// Nothing is pre-marked — the professor marks each student present or absent.
export async function startSession(subject: string, facultyId: string, facultyName: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), {
    subject,
    facultyId,
    facultyName,
    date: today,
    createdAt: serverTimestamp(),
    finalized: false,
    records: {},
  });
  return docRef.id;
}

// Mark (or change) one student's status within a session, before it's finalized.
export async function markStudent(sessionId: string, studentUid: string, status: AttendanceStatus): Promise<void> {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    [`records.${studentUid}`]: status,
  });
}

// Lock the session — this is the point at which it becomes each student's official record.
export async function finalizeSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    finalized: true,
  });
}

// Live subscription to every finalized session that includes this student,
// used to compute their attendance percentage per subject.
export function subscribeToStudentSessions(
  studentUid: string,
  onUpdate: (sessions: Session[]) => void
): () => void {
  const q = query(collection(db, SESSIONS_COLLECTION), where('finalized', '==', true));
  return onSnapshot(q, (snapshot) => {
    const sessions: Session[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Omit<Session, 'id'>;
      if (data.records && studentUid in data.records) {
        sessions.push({ id: docSnap.id, ...data });
      }
    });
    onUpdate(sessions);
  });
}

// Live subscription to a specific session (used by the faculty screen while marking).
export function subscribeToSession(sessionId: string, onUpdate: (session: Session | null) => void): () => void {
  return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (docSnap) => {
    if (docSnap.exists()) {
      onUpdate({ id: docSnap.id, ...(docSnap.data() as Omit<Session, 'id'>) });
    } else {
      onUpdate(null);
    }
  });
}
