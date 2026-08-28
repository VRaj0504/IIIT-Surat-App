import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

export type LeaveType = "medical" | "casual";
export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveApplication = {
  id: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  // facultyEmail is the source of truth for "who this is addressed to" —
  // works whether or not that faculty member has ever signed into the app
  // yet (see facultyService.ts, which lists allowlisted faculty before
  // they've signed up too). facultyUid is filled in only if/once they have
  // a real account; it's informational only, never used for permissions.
  facultyEmail: string;
  facultyUid: string | null;
  facultyName: string;
  type: LeaveType;
  fromDate: string; // "YYYY-MM-DD"
  toDate: string; // "YYYY-MM-DD"
  reason: string;
  status: LeaveStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
};

const COLLECTION = "leaveApplications";

export async function applyForLeave(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  facultyEmail: string;
  facultyUid: string | null;
  facultyName: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
}): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    studentUid: params.studentUid,
    studentName: params.studentName,
    ...(params.studentEnrollmentNumber ? { studentEnrollmentNumber: params.studentEnrollmentNumber } : {}),
    facultyEmail: params.facultyEmail,
    facultyUid: params.facultyUid,
    facultyName: params.facultyName,
    type: params.type,
    fromDate: params.fromDate,
    toDate: params.toDate,
    reason: params.reason.trim(),
    status: "pending",
    facultyRemark: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });
}

// A student's own leave history, every status, newest first.
export function subscribeToMyLeaveApplications(
  studentUid: string,
  onUpdate: (apps: LeaveApplication[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("studentUid", "==", studentUid),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveApplication, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[leaveService] subscribeToMyLeaveApplications error:", err);
    },
  );
}

// Every leave request addressed to this specific faculty member, newest
// first — matched by email (works before they've even signed up, unlike
// uid) — includes already-resolved ones so they can see their own history
// of decisions, not just the pending queue.
export function subscribeToLeaveRequestsForFaculty(
  facultyEmail: string,
  onUpdate: (apps: LeaveApplication[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("facultyEmail", "==", facultyEmail),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveApplication, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[leaveService] subscribeToLeaveRequestsForFaculty error:", err);
    },
  );
}

// Only the faculty this was addressed to (matched by their own signed-in
// email against facultyEmail — see firestore.rules) or an admin can call
// this. Every other field is locked so a resolve can't quietly change the
// dates/reason/etc. it's approving.
export async function resolveLeaveApplication(
  appId: string,
  resolverUid: string,
  status: "approved" | "rejected",
  remark?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, appId), {
    status,
    resolvedAt: serverTimestamp(),
    resolvedBy: resolverUid,
    facultyRemark: remark?.trim() || null,
  });
}
