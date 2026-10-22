import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from './liveCache';

export type StudentCoordinator = {
  id: string;
  name: string;
  role: string;
  branch?: string;
  yearLabel?: string;
  email: string;
  phone?: string;
};

const COLLECTION = "tnpCoordinators";

export function subscribeToTnpCoordinators(
  onUpdate: (coordinators: StudentCoordinator[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), orderBy("name"));
  return persisted("tnp", (onUpdate) => onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentCoordinator, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[tnpCoordinatorsService] subscribeToTnpCoordinators error:", err);
    },
  ), onUpdate);
}
