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

// This channel carries two different things people bring to admin/faculty:
// an actual complaint (something wrong that needs fixing) and a doubt (an
// academic question with no other obvious place to ask it). They share one
// collection, one review queue, and one resolve/reject flow — only the
// category list and some wording differ by `type`.
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
  // Who this is addressed to. null means the original "general channel" —
  // every faculty/admin can see it, same as before this field existed.
  // Set, it's visible only to that one faculty member (plus admin) —
  // so picking a specific person for a subject doubt or a targeted
  // complaint doesn't put it in front of every other faculty too.
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

// Docs written before `type` existed have no such field. Every read path
// below defaults a missing type to "complaint" — the original meaning of
// this collection — rather than leaving it undefined for old data.
function withType(id: string, data: Omit<Complaint, "id">): Complaint {
  return { id, ...data, type: data.type ?? "complaint" };
}

const COLLECTION = "complaints";
// Same reasoning and same cap as resourceService.ts's FACULTY_VIEW_LIMIT —
// a handful of faculty/admin accounts hold this listener open
// indefinitely, so without a cap it re-syncs the entire complaint
// history ever filed, forever, growing every single day. This is
// generous headroom (every complaint ever filed across the whole
// college, capped at 500, still comfortably covers "everything pending
// plus recent history" for a real review queue), not a tight limit
// meant to hide anything.
const FACULTY_VIEW_LIMIT = 500;

// Unlike leaveApplications, a complaint isn't addressed to one specific
// faculty member — it's a general channel to admin/faculty as a whole
// (facilities, harassment, academic issues, ...), so there's no
// facultyEmail field here at all, and the review side (below) reads
// every complaint rather than filtering by recipient.
export async function submitComplaint(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  type: IssueType;
  category: ComplaintCategory | DoubtCategory;
  // Omit (or pass undefined) for the general channel — every faculty/admin
  // sees it, same as before targeting existed.
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

// A student's own complaint history, every status, newest first.
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

// Every complaint, for any faculty/admin to review — see firestore.rules'
// isFaculty()/isAdmin() for who's actually allowed to read this query.
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
