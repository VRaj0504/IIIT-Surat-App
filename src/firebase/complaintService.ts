import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db } from "./firestore";
import { storage } from "./storage";

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
  photoPaths?: string[];
};

export async function complaintPhotoUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

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
  photoUris?: string[];
}): Promise<void> {
  const docRef = doc(collection(db, COLLECTION));
  const photoPaths: string[] = [];
  for (const [i, uri] of (params.photoUris ?? []).slice(0, 2).entries()) {
    const blob = await (await fetch(uri)).blob();
    const path = `complaints/${params.studentUid}/${docRef.id}/${i + 1}.jpg`;
    await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
    photoPaths.push(path);
  }
  await setDoc(docRef, {
    ...(photoPaths.length ? { photoPaths } : {}),
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

export function subscribeToAllComplaints(
  viewer: { email: string; isAdmin: boolean },
  onUpdate: (complaints: Complaint[]) => void,
): () => void {
  const onErr = (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[complaintService] subscribeToAllComplaints error:", err);
  };
  const parts = new Map<string, Complaint[]>();
  const emit = () => {
    const byId = new Map<string, Complaint>();
    parts.forEach((list) => list.forEach((c) => byId.set(c.id, c)));
    const all = Array.from(byId.values()).sort(
      (a, b) => ((b.createdAt as Timestamp | null)?.toMillis?.() ?? 0) - ((a.createdAt as Timestamp | null)?.toMillis?.() ?? 0),
    );
    onUpdate(all.slice(0, FACULTY_VIEW_LIMIT));
  };
  const listen = (key: string, q: ReturnType<typeof query>) =>
    onSnapshot(
      q,
      (snapshot) => {
        parts.set(key, snapshot.docs.map((d) => withType(d.id, d.data() as Omit<Complaint, "id">)));
        emit();
      },
      (err) => {
        parts.set(key, []);
        emit();
        onErr(err);
      },
    );

  const email = viewer.email.toLowerCase();
  const unsubs: (() => void)[] = [];
  let stopped = false;
  const isCommittee = viewer.isAdmin
    ? Promise.resolve(true)
    : getDoc(doc(db, "config", "complaints"))
        .then((snap) =>
          ((snap.data() as { committeeEmails?: string[] } | undefined)?.committeeEmails ?? [])
            .map((e) => e.toLowerCase())
            .includes(email),
        )
        .catch(() => false);
  isCommittee.then((seesAll) => {
    if (stopped) return;
    if (seesAll) {
      unsubs.push(
        listen("all", query(collection(db, COLLECTION), orderBy("createdAt", "desc"), fsLimit(FACULTY_VIEW_LIMIT))),
      );
      return;
    }
    unsubs.push(
      listen("mine", query(collection(db, COLLECTION), where("facultyEmail", "==", email))),
      listen("openDoubts", query(collection(db, COLLECTION), where("facultyEmail", "==", null), where("type", "==", "doubt"))),
    );
  });
  return () => {
    stopped = true;
    unsubs.forEach((u) => u());
  };
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
