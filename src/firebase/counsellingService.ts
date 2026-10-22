import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

const REQUESTS_COLLECTION = "counsellingRequests";
const COUNSELLORS_COLLECTION = "counsellors";

export const CONCERN_CATEGORIES = [
  "Academic stress",
  "Anxiety",
  "Low mood / sadness",
  "Relationships / Family",
  "Sleep",
  "Other",
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

export type CounsellingStatus = "pending" | "contacted" | "closed";

export type CounsellingRequest = {
  id: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  studentEmail: string;
  concern: ConcernCategory;
  message: string;
  urgent: boolean;
  status: CounsellingStatus;
  privateNote: string | null;
  createdAt: Timestamp | null;
  contactedAt: Timestamp | null;
  contactedBy: string | null;
  contactedByName: string | null;
};

export async function isCounsellor(email: string): Promise<boolean> {
  const snap = await getDoc(doc(db, COUNSELLORS_COLLECTION, email.toLowerCase()));
  return snap.exists();
}

export async function submitCounsellingRequest(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  studentEmail: string;
  concern: ConcernCategory;
  message: string;
  urgent: boolean;
}): Promise<void> {
  await addDoc(collection(db, REQUESTS_COLLECTION), {
    studentUid: params.studentUid,
    studentName: params.studentName,
    ...(params.studentEnrollmentNumber ? { studentEnrollmentNumber: params.studentEnrollmentNumber } : {}),
    studentEmail: params.studentEmail.toLowerCase(),
    concern: params.concern,
    message: params.message,
    urgent: params.urgent,
    status: "pending",
    privateNote: null,
    createdAt: serverTimestamp(),
    contactedAt: null,
    contactedBy: null,
    contactedByName: null,
  });
}

export function subscribeToMyCounsellingRequests(
  studentUid: string,
  onUpdate: (requests: CounsellingRequest[]) => void,
): () => void {
  const q = query(
    collection(db, REQUESTS_COLLECTION),
    where("studentUid", "==", studentUid),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CounsellingRequest, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[counsellingService] subscribeToMyCounsellingRequests error:", err);
    },
  );
}

export function subscribeToCounsellingQueue(onUpdate: (requests: CounsellingRequest[]) => void): () => void {
  const q = query(collection(db, REQUESTS_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CounsellingRequest, "id">) }));
      requests.sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0);
      });
      onUpdate(requests);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[counsellingService] subscribeToCounsellingQueue error:", err);
    },
  );
}

export async function updateCounsellingRequest(
  requestId: string,
  patch: { status: CounsellingStatus; privateNote?: string; contactedBy: string; contactedByName: string },
): Promise<void> {
  await updateDoc(doc(db, REQUESTS_COLLECTION, requestId), {
    status: patch.status,
    ...(patch.privateNote !== undefined ? { privateNote: patch.privateNote } : {}),
    contactedAt: serverTimestamp(),
    contactedBy: patch.contactedBy,
    contactedByName: patch.contactedByName,
  });
}
