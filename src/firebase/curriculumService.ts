import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firestore';

export type CurriculumSubject = {
  code: string;
  name: string;
  // Optional since the faculty-upload-web uploader doesn't collect this
  // yet for older entries — the grading screen falls back to asking
  // faculty to confirm/type it inline when missing.
  credits?: number;
};

// Live-subscribes to just the subjects matching one branch + semester —
// not the whole curriculum collection, so this stays fast even once
// every branch/semester/subject across all years is in Firestore.
export function subscribeToCurriculum(
  branch: string,
  semester: number,
  onUpdate: (subjects: CurriculumSubject[]) => void
): () => void {
  const q = query(
    collection(db, 'curriculum'),
    where('branch', '==', branch),
    where('semester', '==', semester)
  );

  return onSnapshot(q, (snapshot) => {
    const subjects: CurriculumSubject[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return { code: data.code, name: data.name, credits: data.credits };
    });
    onUpdate(subjects);
  });
}