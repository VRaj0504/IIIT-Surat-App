import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firestore";
import { persisted } from "./liveCache";

export type ExamEventType = "supplementary" | "makeup" | "endsem" | "midsem" | "other";
export type RegistrationMode = "none" | "backlogs" | "subjects";

export const EXAM_EVENT_LABELS: Record<ExamEventType, string> = {
  supplementary: "Supplementary exam",
  makeup: "Make-up exam",
  endsem: "End-semester exam",
  midsem: "Mid-semester exam",
  other: "Exam notice",
};

export type ExamEvent = {
  id: string;
  title: string;
  type: ExamEventType;
  details: string;
  branches: string[];
  admissionYears: number[];
  registration: RegistrationMode;
  requiresMedical: boolean;
  deadline: Timestamp | null;
  active: boolean;
  link: string | null;
  createdByName: string | null;
  createdAt: Timestamp | null;
};

export type RegisteredSubject = {
  code: string;
  name: string;
  semester: number;
  grade: string | null;
};

export type ExamRegistration = {
  id: string;
  eventId: string;
  eventTitle: string;
  studentUid: string;
  enrollmentNumber: string;
  studentName: string;
  branch: string;
  section: string | null;
  admissionYear: number;
  subjects: RegisteredSubject[];
  medicalDeclared: boolean;
  status: "submitted" | "accepted" | "rejected";
  remark: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export function registrationId(eventId: string, enrollmentNumber: string): string {
  return `${eventId}_${enrollmentNumber}`;
}

export function eventAppliesTo(
  event: ExamEvent,
  student: { branch?: string | null; admissionYear?: number | null },
): boolean {
  if (event.branches.length > 0 && (!student.branch || !event.branches.includes(student.branch))) return false;
  if (event.admissionYears.length > 0 && (!student.admissionYear || !event.admissionYears.includes(student.admissionYear))) return false;
  return true;
}

export function isRegistrationOpen(event: ExamEvent, now: Date = new Date()): boolean {
  if (!event.active || event.registration === "none") return false;
  if (event.deadline && event.deadline.toDate().getTime() < now.getTime()) return false;
  return true;
}

function toEvent(id: string, data: any): ExamEvent {
  return {
    id,
    title: data.title ?? "",
    type: (data.type ?? "other") as ExamEventType,
    details: data.details ?? "",
    branches: Array.isArray(data.branches) ? data.branches : [],
    admissionYears: Array.isArray(data.admissionYears) ? data.admissionYears : [],
    registration: (data.registration ?? "none") as RegistrationMode,
    requiresMedical: data.requiresMedical === true,
    deadline: data.deadline ?? null,
    active: data.active === true,
    link: data.link ?? null,
    createdByName: data.createdByName ?? null,
    createdAt: data.createdAt ?? null,
  };
}

export function subscribeToActiveExamEvents(onUpdate: (events: ExamEvent[]) => void): () => void {
  const q = query(collection(db, "examEvents"), where("active", "==", true));
  return persisted(
    "examEvents:active",
    (emit) =>
      onSnapshot(
        q,
        (snap) => {
          const events = snap.docs
            .map((d) => toEvent(d.id, d.data()))
            .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
          emit(events);
        },
        (err) => {
          console.error("[examService] events error:", err);
        },
      ),
    onUpdate,
  );
}

export function subscribeToMyExamRegistrations(
  uid: string,
  onUpdate: (registrations: ExamRegistration[]) => void,
): () => void {
  const q = query(collection(db, "examRegistrations"), where("studentUid", "==", uid));
  return persisted(
    `examRegistrations:${uid}`,
    (emit) =>
      onSnapshot(
        q,
        (snap) => {
          emit(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamRegistration, "id">) })));
        },
        (err) => {
          console.error("[examService] registrations error:", err);
        },
      ),
    onUpdate,
  );
}

export async function saveExamRegistration(params: {
  event: ExamEvent;
  studentUid: string;
  enrollmentNumber: string;
  studentName: string;
  branch: string;
  section: string | null;
  admissionYear: number;
  subjects: RegisteredSubject[];
  medicalDeclared: boolean;
  alreadyRegistered: boolean;
}): Promise<void> {
  const ref = doc(db, "examRegistrations", registrationId(params.event.id, params.enrollmentNumber));
  if (params.alreadyRegistered) {
    await updateDoc(ref, {
      subjects: params.subjects,
      medicalDeclared: params.medicalDeclared,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await setDoc(ref, {
    eventId: params.event.id,
    eventTitle: params.event.title,
    studentUid: params.studentUid,
    enrollmentNumber: params.enrollmentNumber,
    studentName: params.studentName,
    branch: params.branch,
    section: params.section,
    admissionYear: params.admissionYear,
    subjects: params.subjects,
    medicalDeclared: params.medicalDeclared,
    status: "submitted",
    remark: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function withdrawExamRegistration(eventId: string, enrollmentNumber: string): Promise<void> {
  await deleteDoc(doc(db, "examRegistrations", registrationId(eventId, enrollmentNumber)));
}
