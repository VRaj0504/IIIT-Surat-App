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

export type MedicalStage = "doctor" | "dr" | "dean" | "hod" | "teachers" | "done" | "rejected";

export type ApproverRole = "doctor" | "dr" | "dean" | "hod";

export const APPROVER_LABEL: Record<ApproverRole, string> = {
  doctor: "Doctor",
  dr: "Deputy Registrar",
  dean: "Dean (Academics)",
  hod: "HOD",
};

export type LeaveDecision = {
  decision: "approved" | "rejected";
  remark: string | null;
  by: string;
  byName: string;
  at: Timestamp | null;
};

export type TeacherSubject = { code: string; name: string; dates: string[] };

export type TeacherAck = {
  id: string;
  leaveId: string;
  email: string;
  name: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber: string | null;
  fromDate: string;
  toDate: string;
  subjects: TeacherSubject[];
  status: "pending" | "confirmed" | "excused" | "declined";
  declinedSessions?: string[];
  remark: string | null;
  createdAt: Timestamp | null;
  confirmedAt: Timestamp | null;
};

export type MedicalLeaveConfig = {
  doctor: { name: string; email: string };
  dr?: { name: string; email: string } | null;
  dean?: { name: string; email: string } | null;
  hodByBranch: Record<string, { name: string; email: string }>;
};
export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveApplication = {
  id: string;
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

  medicalReportUrl?: string | null;
  status: LeaveStatus;
  facultyRemark: string | null;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;

  stage?: MedicalStage;
  doctorEmail?: string;
  doctorName?: string;
  hodEmail?: string;
  hodName?: string;
  drEmail?: string;
  drName?: string;
  deanEmail?: string;
  deanName?: string;
  doctorDecision?: LeaveDecision;
  drDecision?: LeaveDecision;
  deanDecision?: LeaveDecision;
  hodDecision?: LeaveDecision;
  teachersTotal?: number;
  teachersConfirmed?: number;
  excusedSessions?: string[];
  excuseAllDates?: boolean;
  autoExcused?: boolean;
  unmatchedFaculty?: string[];
  teacherNote?: string;
};

const COLLECTION = "leaveApplications";

export async function getMedicalLeaveConfig(): Promise<MedicalLeaveConfig | null> {
  const snap = await getDoc(doc(db, "config", "medicalLeave"));
  return snap.exists() ? (snap.data() as MedicalLeaveConfig) : null;
}

export async function applyForMedicalLeave(params: {
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string;
  studentBranch: string;
  fromDate: string;
  toDate: string;
  reason: string;
  medicalReportUrl: string;
}): Promise<{ doctorName: string; hodName: string; drName: string; deanName: string }> {
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

    facultyEmail: cfg.doctor.email,
    facultyUid: null,
    facultyName: cfg.doctor.name,
    doctorEmail: cfg.doctor.email,
    doctorName: cfg.doctor.name,
    hodEmail: hod.email,
    hodName: hod.name,
    drEmail: cfg.dr?.email ?? "",
    drName: cfg.dr?.name ?? "",
    deanEmail: cfg.dean?.email ?? "",
    deanName: cfg.dean?.name ?? "",
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
  return { doctorName: cfg.doctor.name, hodName: hod.name, drName: cfg.dr?.email ? cfg.dr.name : "", deanName: cfg.dean?.email ? cfg.dean.name : "" };
}

export function approvalChain(app: Pick<LeaveApplication, "drEmail" | "deanEmail">): ApproverRole[] {
  const chain: ApproverRole[] = ["doctor"];
  if (app.drEmail) chain.push("dr");
  if (app.deanEmail) chain.push("dean");
  chain.push("hod");
  return chain;
}

export function nextMedicalStage(role: ApproverRole, app: Pick<LeaveApplication, "drEmail" | "deanEmail">): MedicalStage {
  const chain = approvalChain(app);
  const i = chain.indexOf(role);
  return i >= 0 && i < chain.length - 1 ? chain[i + 1] : "teachers";
}

export function approverName(role: ApproverRole, app: LeaveApplication): string {
  if (role === "doctor") return app.doctorName ?? "the doctor";
  if (role === "dr") return app.drName ?? "the Deputy Registrar";
  if (role === "dean") return app.deanName ?? "the Dean";
  return app.hodName ?? "the HOD";
}

function sortNewestFirst<T extends { createdAt: Timestamp | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export function subscribeToMedicalLeavesFor(
  role: ApproverRole,
  email: string,
  onUpdate: (apps: LeaveApplication[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where(`${role}Email`, "==", email));
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

export async function decideMedicalLeave(params: {
  app: LeaveApplication;
  role: ApproverRole;
  decision: "approved" | "rejected";
  remark?: string;
  deciderUid: string;
  deciderName: string;
}): Promise<void> {
  const approved = params.decision === "approved";
  const next: MedicalStage = !approved ? "rejected" : nextMedicalStage(params.role, params.app);
  await updateDoc(doc(db, COLLECTION, params.app.id), {
    stage: next,
    status: !approved ? "rejected" : next === "teachers" ? "approved" : "pending",
    [`${params.role}Decision`]: {
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

export function sessionKey(code: string, date: string): string {
  return `${code}|${date}`;
}

export async function setTeacherAckDecision(params: {
  leaveId: string;
  teacherEmail: string;
  uid: string;
  status: "excused" | "declined";
  declinedSessions: string[];
  remark?: string;
}): Promise<void> {
  await updateDoc(doc(db, COLLECTION, params.leaveId, "teacherAcks", params.teacherEmail), {
    status: params.status,
    declinedSessions: params.status === "declined" ? [] : params.declinedSessions,
    confirmedAt: serverTimestamp(),
    confirmedBy: params.uid,
    remark: params.remark?.trim() || null,
  });
}

export function excusedSessionSet(apps: LeaveApplication[]): Set<string> {
  const out = new Set<string>();
  for (const a of apps) {
    if (a.type !== "medical") continue;
    for (const k of a.excusedSessions ?? []) out.add(k);
    if (a.excuseAllDates && (a.stage === "done" || a.stage === "teachers")) {
      const start = new Date(`${a.fromDate}T00:00:00`);
      const end = new Date(`${a.toDate}T00:00:00`);
      for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        out.add(`*|${iso}`);
      }
    }
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
