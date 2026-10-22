import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

const COORDINATORS_COLLECTION = "eventCoordinators";
const EXCUSALS_COLLECTION = "eventExcusals";

export type EventCoordinator = {
  id: string;
  name: string;
  email: string;
};

export async function isEventCoordinator(email: string): Promise<boolean> {
  const q = query(collection(db, COORDINATORS_COLLECTION), where("email", "==", email.toLowerCase()));
  const snap = await getDocs(q);
  return !snap.empty;
}

export type ExcusalStatus = "pending" | "approved" | "rejected";

export type EventExcusal = {
  id: string;
  eventName: string;
  fromDate: string;
  toDate: string;
  studentEnrollmentNumbers: string[];
  facultyCoordinatorUid: string;
  facultyCoordinatorName: string;
  facultyCoordinatorEmail: string;
  submittedBy: string;
  submittedByName: string;
  status: ExcusalStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  respondedAt: Timestamp | null;
};

export async function submitEventExcusal(params: {
  eventName: string;
  fromDate: string;
  toDate: string;
  studentEnrollmentNumbers: string[];
  facultyCoordinatorUid: string;
  facultyCoordinatorName: string;
  facultyCoordinatorEmail: string;
  submittedBy: string;
  submittedByName: string;
}): Promise<void> {
  await addDoc(collection(db, EXCUSALS_COLLECTION), {
    eventName: params.eventName.trim(),
    fromDate: params.fromDate,
    toDate: params.toDate,
    studentEnrollmentNumbers: params.studentEnrollmentNumbers,
    facultyCoordinatorUid: params.facultyCoordinatorUid,
    facultyCoordinatorName: params.facultyCoordinatorName,
    facultyCoordinatorEmail: params.facultyCoordinatorEmail,
    submittedBy: params.submittedBy,
    submittedByName: params.submittedByName,
    status: "pending",
    facultyRemark: null,
    createdAt: serverTimestamp(),
    respondedAt: null,
  });
}

export function subscribeToMySubmittedExcusals(
  submittedBy: string,
  onUpdate: (excusals: EventExcusal[]) => void,
): () => void {
  const q = query(collection(db, EXCUSALS_COLLECTION), where("submittedBy", "==", submittedBy));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventExcusal, "id">) })));
  });
}

export function subscribeToAssignedExcusals(
  facultyCoordinatorUid: string,
  onUpdate: (excusals: EventExcusal[]) => void,
): () => void {
  const q = query(collection(db, EXCUSALS_COLLECTION), where("facultyCoordinatorUid", "==", facultyCoordinatorUid));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventExcusal, "id">) })));
  });
}

export async function respondToExcusal(
  excusalId: string,
  status: "approved" | "rejected",
  remark: string | null,
): Promise<void> {
  await updateDoc(doc(db, EXCUSALS_COLLECTION, excusalId), {
    status,
    facultyRemark: remark,
    respondedAt: serverTimestamp(),
  });
}

export async function getApprovedExcusalRanges(
  enrollmentNumber: string,
): Promise<{ fromDate: string; toDate: string; eventName: string }[]> {
  const q = query(
    collection(db, EXCUSALS_COLLECTION),
    where("studentEnrollmentNumbers", "array-contains", enrollmentNumber),
    where("status", "==", "approved"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as EventExcusal;
    return { fromDate: data.fromDate, toDate: data.toDate, eventName: data.eventName };
  });
}

export function isDateWithinExcusal(
  date: string,
  ranges: { fromDate: string; toDate: string }[],
): boolean {
  return ranges.some((r) => date >= r.fromDate && date <= r.toDate);
}

export type RosterSearchResult = { regNo: string; name: string };

export async function searchWholeRoster(queryText: string): Promise<RosterSearchResult[]> {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  const snap = await getDocs(collection(db, "roster"));
  return snap.docs
    .map((d) => ({ regNo: d.id, name: (d.data() as { name: string }).name }))
    .filter((r) => r.regNo.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
    .slice(0, 20);
}
