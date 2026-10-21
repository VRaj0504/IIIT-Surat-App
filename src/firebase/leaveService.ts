import {
  collection,
  collectionGroup,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from './liveCache';

export type LeaveType = "medical" | "casual";

// Medical leave is a chain — see functions/src/medicalLeaveWorkflow.ts:
// doctor -> HOD (of the student's branch) -> each teacher whose class
// was missed confirms -> done. `stage` is whose turn it is.
export type MedicalStage = "doctor" | "hod" | "teachers" | "done" | "rejected";

export type LeaveDecision = {
  decision: "approved" | "rejected";
  remark: string | null;
  by: string; // uid
  byName: string;
  at: Timestamp | null;
};

export type TeacherSubject = { code: string; name: string; dates: string[] };

// One teacher's to-do for one medical leave (leaveApplications/{id}/
// teacherAcks/{teacherEmail}). Created by the Cloud Function after HOD
// approval; deliberately carries no report or reason — a teacher only
// needs who, when, and which of their classes.
export type TeacherAck = {
  id: string; // == email
  leaveId: string;
  email: string;
  name: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber: string | null;
  fromDate: string;
  toDate: string;
  subjects: TeacherSubject[];
  status: "pending" | "confirmed";
  remark: string | null;
  createdAt: Timestamp | null;
  confirmedAt: Timestamp | null;
};

export type MedicalLeaveConfig = {
  doctor: { name: string; email: string };
  hodByBranch: Record<string, { name: string; email: string }>;
};
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
  // Only ever set for type === "medical" — a Drive link to the actual
  // report, so the Medical Officer has something real to check before
  // approving, not just a student's own description of being unwell.
  medicalReportUrl?: string | null;
  status: LeaveStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;

  // ---- medical chain only ----
  stage?: MedicalStage;
  doctorEmail?: string;
  doctorName?: string;
  hodEmail?: string;
  hodName?: string;
  doctorDecision?: LeaveDecision;
  hodDecision?: LeaveDecision;
  teachersTotal?: number;
  teachersConfirmed?: number;
  excusedSessions?: string[]; // "CS304|2026-10-19"
  unmatchedFaculty?: string[];
  teacherNote?: string;
};

const COLLECTION = "leaveApplications";

export async function getMedicalLeaveConfig(): Promise<MedicalLeaveConfig | null> {
  const snap = await getDoc(doc(db, "config", "medicalLeave"));
  return snap.exists() ? (snap.data() as MedicalLeaveConfig) : null;
}

// Medical leave: the doctor and HOD come from config/medicalLeave, never
// from the student — firestore.rules rejects anything else.
export async function applyForMedicalLeave(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  studentBranch: string;
  fromDate: string;
  toDate: string;
  reason: string;
  medicalReportUrl: string;
}): Promise<{ doctorName: string; hodName: string }> {
  const cfg = await getMedicalLeaveConfig();
  if (!cfg?.doctor?.email) {
    throw new Error("Medical leave isn't set up yet (no doctor configured). Please contact the admin.");
  }
  const hod = cfg.hodByBranch?.[params.studentBranch];
  if (!hod?.email) {
    throw new Error(`No HOD is set up for ${params.studentBranch} yet. Please contact the admin.`);
  }
  await addDoc(collection(db, COLLECTION), {
    studentUid: params.studentUid,
    studentName: params.studentName,
    ...(params.studentEnrollmentNumber ? { studentEnrollmentNumber: params.studentEnrollmentNumber } : {}),
    type: "medical",
    stage: "doctor",
    // facultyEmail/Name = "whose desk it starts on", for older screens.
    facultyEmail: cfg.doctor.email,
    facultyUid: null,
    facultyName: cfg.doctor.name,
    doctorEmail: cfg.doctor.email,
    doctorName: cfg.doctor.name,
    hodEmail: hod.email,
    hodName: hod.name,
    fromDate: params.fromDate,
    toDate: params.toDate,
    reason: params.reason.trim(),
    medicalReportUrl: params.medicalReportUrl,
    status: "pending",
    facultyRemark: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });
  return { doctorName: cfg.doctor.name, hodName: hod.name };
}

function sortNewestFirst<T extends { createdAt: Timestamp | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

// The doctor's or HOD's medical-leave desk (every stage, so they keep a
// history of what they decided). Sorted here rather than with orderBy,
// so no extra composite index is needed.
export function subscribeToMedicalLeavesFor(
  role: "doctor" | "hod",
  email: string,
  onUpdate: (apps: LeaveApplication[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where(role === "doctor" ? "doctorEmail" : "hodEmail", "==", email));
  return onSnapshot(
    q,
    (snapshot) =>
      onUpdate(sortNewestFirst(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveApplication, "id">) })))),
    (err) => {
      // eslint-disable-next-line no-console
      console.error(`[leaveService] subscribeToMedicalLeavesFor(${role}) error:`, err);
    },
  );
}

// Step 1 (doctor) and step 2 (HOD). Approving moves the leave to the next
// person; rejecting ends it. firestore.rules allows each person to act
// only on their own step.
export async function decideMedicalLeave(params: {
  appId: string;
  role: "doctor" | "hod";
  decision: "approved" | "rejected";
  remark?: string;
  deciderUid: string;
  deciderName: string;
}): Promise<void> {
  const approved = params.decision === "approved";
  const next: MedicalStage = !approved ? "rejected" : params.role === "doctor" ? "hod" : "teachers";
  await updateDoc(doc(db, COLLECTION, params.appId), {
    stage: next,
    status: !approved ? "rejected" : params.role === "hod" ? "approved" : "pending",
    [params.role === "doctor" ? "doctorDecision" : "hodDecision"]: {
      decision: params.decision,
      remark: params.remark?.trim() || null,
      by: params.deciderUid,
      byName: params.deciderName,
      at: serverTimestamp(),
    },
    facultyRemark: params.remark?.trim() || null,
    resolvedAt: serverTimestamp(),
    resolvedBy: params.deciderUid,
  });
}

// Step 3 — a teacher's queue across every medical leave.
export function subscribeToMyTeacherAcks(
  email: string,
  onUpdate: (acks: TeacherAck[]) => void,
): () => void {
  const q = query(collectionGroup(db, "teacherAcks"), where("email", "==", email));
  return onSnapshot(
    q,
    (snapshot) =>
      onUpdate(sortNewestFirst(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherAck, "id">) })))),
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[leaveService] subscribeToMyTeacherAcks error:", err);
    },
  );
}

// The student's view of step 3: which teachers have confirmed so far.
export function subscribeToAcksForLeave(
  leaveId: string,
  studentUid: string,
  onUpdate: (acks: TeacherAck[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION, leaveId, "teacherAcks"),
    where("studentUid", "==", studentUid),
  );
  return onSnapshot(
    q,
    (snapshot) => onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherAck, "id">) }))),
    () => onUpdate([]),
  );
}

export async function confirmTeacherAck(params: {
  leaveId: string;
  teacherEmail: string;
  uid: string;
  remark?: string;
}): Promise<void> {
  await updateDoc(doc(db, COLLECTION, params.leaveId, "teacherAcks", params.teacherEmail), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy: params.uid,
    remark: params.remark?.trim() || null,
  });
}

// "CS304|2026-10-19" keys for every class session excused by a completed
// medical-leave teacher confirmation — used by attendanceService.
export function excusedSessionSet(apps: LeaveApplication[]): Set<string> {
  const out = new Set<string>();
  for (const a of apps) {
    if (a.type !== "medical") continue;
    for (const k of a.excusedSessions ?? []) out.add(k);
  }
  return out;
}

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
  medicalReportUrl?: string;
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
    medicalReportUrl: params.medicalReportUrl ?? null,
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
  return persisted(`myleaves:${studentUid}`, (onUpdate) => onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveApplication, "id">) })));
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[leaveService] subscribeToMyLeaveApplications error:", err);
    },
  ), onUpdate);
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
