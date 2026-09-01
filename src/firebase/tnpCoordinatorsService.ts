import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firestore";

export type StudentCoordinator = {
  id: string;
  name: string;
  role: string; // e.g. "Placement Coordinator", "TnP Core Team"
  branch?: string;
  yearLabel?: string; // e.g. "3rd Year" — free text, not tied to admissionYear
  email: string;
  phone?: string;
};

const COLLECTION = "tnpCoordinators";

// Read-only from the app's perspective — these are managed by an admin
// via a seed script (scripts/seed-tnp-coordinators.js), the same pattern
// already used for the faculty allowlist, since this list is small and
// changes rarely enough that a dedicated in-app management UI isn't
// worth building yet.
export function subscribeToTnpCoordinators(
  onUpdate: (coordinators: StudentCoordinator[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), orderBy("name"));
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentCoordinator, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[tnpCoordinatorsService] subscribeToTnpCoordinators error:", err);
    },
  );
}
