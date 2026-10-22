import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firestore';
import { persisted } from './liveCache';

export type CurriculumSubject = {
  code: string;
  name: string;

  credits?: number;
};

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

  return persisted(`curr:${branch}:${semester}`, (onUpdate) => onSnapshot(q, (snapshot) => {
    const subjects: CurriculumSubject[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return { code: data.code, name: data.name, credits: data.credits };
    });
    onUpdate(subjects);
  }), onUpdate);
}