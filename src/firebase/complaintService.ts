import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";

export type IssueType = "complaint" | "doubt";
export type ComplaintCategory = "Facilities" | "Harassment" | "Academic" | "Other";
export type DoubtCategory = "Coursework" | "Exam" | "Other";
export type ComplaintStatus = "pending" | "resolved" | "rejected";

export type Complaint = {
  id: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  type: IssueType;
  category: ComplaintCategory | DoubtCategory;

  facultyEmail: string | null;
  facultyName: string | null;
  facultyUid: string | null;
  subject: string;
  description: string;
  status: ComplaintStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
};

function withType(id: string, data: Omit<Complaint, "id">): Complaint {
  return { id, ...data, type: data.type ?? "complaint" };
}

const COLLECTION = "complaints";

const FACULTY_VIEW_LIMIT = 500;

export async function submitComplaint(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  type: IssueType;
  category: ComplaintCategory | DoubtCategory;

  facultyEmail?: string;
  facultyName?: string;
  facultyUid?: string | null;
  subject: string;
  description: string;
}): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    studentUid: params.studentUid,
    studentName: params.studentName,
    ...(params.studentEnrollmentNumber ? { studentEnrollmentNumber: params.studentEnrollmentNumber } : {}),
    type: params.type,
    category: params.category,
    facultyEmail: params.facultyEmail ? params.facultyEmail.toLowerCase() : null,
    facultyName: params.facultyName ?? null,
    facultyUid: params.facultyUid ?? null,
    subject: params.subject.trim(),
    description: params.description.trim(),
    status: "pending",
    facultyRemark: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
  });
}

export function subscribeToMyComplaints(
  studentUid: string,
  onUpdate: (complaints: Complaint[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("studentUid", "==", studentUid),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => withType(d.id, d.data() as Omit<Complaint, "id">)));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[complaintService] subscribeToMyComplaints error:", err);
    },
  );
}

export function subscribeToAllComplaints(onUpdate: (complaints: Complaint[]) => void): () => void {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"), fsLimit(FACULTY_VIEW_LIMIT));
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => withType(d.id, d.data() as Omit<Complaint, "id">)));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[complaintService] subscribeToAllComplaints error:", err);
    },
  );
}

export async function resolveComplaint(
  complaintId: string,
  resolverUid: string,
  resolverName: string,
  status: "resolved" | "rejected",
  remark?: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, complaintId), {
    status,
    resolvedAt: serverTimestamp(),
    resolvedBy: resolverUid,
    resolvedByName: resolverName,
    facultyRemark: remark?.trim() || null,
  });
}
