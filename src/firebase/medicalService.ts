import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, serverTimestamp, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db } from "./firestore";
import { functions } from "./functionsClient";
import { storage } from "./storage";

export const MEDICAL_TEMPLATE_URL = "https://collegego-iiitsurat.web.app/forms/IIITS-Medical-Leave-Form.pdf";
export const LATE_LIMIT_DAYS = 4;
const COLLECTION = "leaveApplications";

export type SignatureVector = { w: number; h: number; paths: string[]; png?: string };
export type MedicalSignRole = "medical" | "hod" | "dean" | "jr";
export type MedicalSign = {
  decision: "approved" | "not_approved";
  comment?: string | null;
  byUid: string;
  byName: string;
  byEmail: string;
  designation?: string | null;
  signature: SignatureVector;
  at?: Timestamp | null;
};
export type AttachmentKind = "report" | "intimation" | "certificate" | "other";
export type MedicalAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  path: string;
  contentType: string;
  size: number;
  uploadedAt?: number;
  byRole?: "student" | "medical";
};
export type MedicalStage = "office" | "returned" | "medical" | "signoff" | "teachers" | "done" | "rejected" | "withdrawn";

export type MedicalRequest = {
  id: string;
  type: "medical";
  flow: 2;
  stage: MedicalStage;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  refNo?: string;
  studentUid: string;
  studentName: string;
  studentEnrollmentNumber?: string | null;
  studentEmail?: string | null;
  branch?: string | null;
  yearOfStudy?: number | null;
  semester?: number | null;
  section?: string | null;
  cgpa?: string | null;
  reason: string;
  fromDate: string;
  toDate: string;
  rejoinedOn: string;
  intimationSent?: boolean;
  intimationDate?: string | null;
  intimationLate?: boolean;
  intimationMissing?: boolean;
  attachments?: MedicalAttachment[];
  officeEmail: string;
  officeName?: string | null;
  medicalEmail: string;
  medicalName?: string | null;
  hodEmail: string;
  hodName?: string | null;
  hodDepartment?: string | null;
  deanEmail: string;
  deanName?: string | null;
  jrEmail: string;
  jrName?: string | null;
  officeReview?: { action: "forwarded" | "returned"; note?: string | null; byName: string; at?: Timestamp | null } | null;
  medicalSign?: MedicalSign | null;
  hodSign?: MedicalSign | null;
  deanSign?: MedicalSign | null;
  jrSign?: MedicalSign | null;
  late?: boolean;
  daysAfterRejoining?: number | null;
  finalDecision?: "approved" | "not_approved" | null;
  returnNote?: string | null;
  returnedBy?: string | null;
  resubmissions?: number;
  pendingEmails?: string[];
  viewerEmails?: string[];
  formPdfPath?: string | null;
  formVersion?: number;
  bundlePath?: string | null;
  teacherNote?: string | null;
  teachersTotal?: number;
  createdAt?: Timestamp | null;
  submittedAt?: Timestamp | null;
  decidedAt?: Timestamp | null;
};

export type MedicalEvent = {
  id: string;
  at?: Timestamp | null;
  byName: string;
  role: string;
  action: string;
  decision?: string | null;
  note?: string | null;
};

type Person = { name: string; email: string };
export type MedicalConfig = {
  flow?: number;
  office?: Person;
  medicalOfficer?: Person;
  hods?: (Person & { department: string })[];
  hodByBranch?: Record<string, Person>;
  dean?: Person;
  jr?: Person;
};

export const ROLE_TITLE: Record<MedicalSignRole, string> = {
  medical: "Medical Officer",
  hod: "HOD",
  dean: "Associate Dean (Academics)",
  jr: "Joint Registrar",
};
export const SIGNOFF_ROLES: MedicalSignRole[] = ["hod", "dean", "jr"];

export const KIND_LABEL: Record<AttachmentKind, string> = {
  report: "Medical report",
  intimation: "Intimation email",
  certificate: "Verified certificate",
  other: "Other document",
};

export const STAGE_LABEL: Record<MedicalStage, string> = {
  office: "With Academic Office",
  returned: "Returned to you",
  medical: "With Medical Officer",
  signoff: "Awaiting signatures",
  teachers: "Approved",
  done: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

export const isFlow2 = (a: { flow?: number; type?: string } | null | undefined): boolean => a?.type === "medical" && a?.flow === 2;

export const isClosed = (r: MedicalRequest) => ["teachers", "done", "rejected", "withdrawn"].includes(r.stage);

export async function getMedicalConfig(): Promise<MedicalConfig | null> {
  const snap = await getDoc(doc(db, "config", "medicalLeave"));
  return snap.exists() ? (snap.data() as MedicalConfig) : null;
}

export function medicalReady(c: MedicalConfig | null | undefined): boolean {
  return !!(c?.office?.email && c.medicalOfficer?.email && c.dean?.email && c.jr?.email && hodChoices(c).length);
}

export function hodChoices(c: MedicalConfig | null | undefined): (Person & { department: string })[] {
  if (!c) return [];
  if (c.hods?.length) return c.hods.filter((h) => h.email);
  return Object.entries(c.hodByBranch ?? {})
    .filter(([, h]) => h?.email)
    .map(([department, h]) => ({ ...h, department }));
}

export function newLeaveId(): string {
  return doc(collection(db, COLLECTION)).id;
}

function isoUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((isoUtc(b) - isoUtc(a)) / 86400000);
}

export function guessContentType(name: string, mime?: string | null): string {
  if (mime && mime !== "application/octet-stream") return mime;
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.hei[cf]$/i.test(name)) return "image/heic";
  return "image/jpeg";
}

export async function uploadMedicalFile(params: {
  studentUid: string;
  leaveId: string;
  folder: "student" | "medical";
  kind: AttachmentKind;
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: Blob | null;
}): Promise<MedicalAttachment> {
  const contentType = guessContentType(params.name, params.mimeType);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType) && contentType !== "application/pdf") {
    throw new Error("Only PDF files and photos (JPG, PNG) can be attached.");
  }
  const blob = params.file ?? (await (await fetch(params.uri)).blob());
  if (blob.size > 10 * 1024 * 1024) throw new Error(`"${params.name}" is over 10 MB. Attach a smaller file.`);
  const id = Math.random().toString(36).slice(2, 10);
  const safe = params.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const path = `medicalLeaves/${params.studentUid}/${params.leaveId}/${params.folder}/${id}-${safe}`;
  await uploadBytes(ref(storage, path), blob, { contentType });
  return { id, kind: params.kind, name: params.name, path, contentType, size: blob.size, uploadedAt: Date.now() };
}

export async function removeMedicalFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path)).catch(() => undefined);
}

export async function fileUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

function errMessage(e: any): string {
  const m = String(e?.message ?? "");
  if (/internal/i.test(m) && !e?.details) return "Something went wrong. Please try again.";
  if (/unavailable|network|failed to fetch/i.test(m)) return "No internet connection. Check your connection and try again.";
  return m.replace(/^FirebaseError:\s*/, "") || "Please try again.";
}

export type SubmitInput = {
  leaveId: string;
  cgpa?: string;
  reason: string;
  fromDate: string;
  toDate: string;
  rejoinedOn: string;
  intimationSent: boolean;
  intimationDate?: string | null;
  hodEmail: string;
  attachments: MedicalAttachment[];
};

export async function submitMedical(input: SubmitInput): Promise<{ refNo: string; late: boolean; daysAfterRejoining: number | null }> {
  try {
    const call = httpsCallable<SubmitInput, { refNo: string; late: boolean; daysAfterRejoining: number | null }>(functions, "medicalSubmit");
    return (await call(input)).data;
  } catch (e) {
    throw new Error(errMessage(e));
  }
}

export type ActInput = {
  leaveId: string;
  action: "forward" | "return" | "sign" | "withdraw" | "rebuild";
  role?: MedicalSignRole;
  decision?: "approved" | "not_approved";
  comment?: string;
  note?: string;
  signature?: SignatureVector;
  saveSignature?: boolean;
  attachments?: MedicalAttachment[];
};

export async function actMedical(input: ActInput): Promise<{ stage: MedicalStage; finalDecision: string | null }> {
  try {
    const call = httpsCallable<ActInput, { stage: MedicalStage; finalDecision: string | null }>(functions, "medicalAct");
    return (await call(input)).data;
  } catch (e) {
    throw new Error(errMessage(e));
  }
}

function toReq(d: { id: string; data: () => unknown }): MedicalRequest {
  return { id: d.id, ...(d.data() as Omit<MedicalRequest, "id">) };
}

const newest = (a: MedicalRequest, b: MedicalRequest) =>
  (b.submittedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0);

export function subscribeMedicalQueue(email: string, cb: (list: MedicalRequest[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLLECTION), where("pendingEmails", "array-contains", email.toLowerCase())),
    (s) => cb(s.docs.map(toReq).filter(isFlow2).sort(newest)),
    (e) => {
      console.error("[medicalService] queue", e);
      onError?.(e);
    },
  );
}

export function subscribeMedicalRecords(email: string, cb: (list: MedicalRequest[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLLECTION), where("viewerEmails", "array-contains", email.toLowerCase())),
    (s) => cb(s.docs.map(toReq).filter(isFlow2).sort(newest)),
    (e) => {
      console.error("[medicalService] records", e);
      onError?.(e);
    },
  );
}

export function subscribeMedicalEvents(leaveId: string, cb: (list: MedicalEvent[]) => void): () => void {
  return onSnapshot(
    query(collection(db, COLLECTION, leaveId, "events"), orderBy("at", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MedicalEvent, "id">) }))),
    (e) => console.error("[medicalService] events", e),
  );
}

export async function loadMySignature(uid: string): Promise<SignatureVector | null> {
  try {
    const snap = await getDoc(doc(db, "signatures", uid));
    if (!snap.exists()) return null;
    const d = snap.data() as SignatureVector;
    if (d.png) return { w: d.w, h: d.h, paths: [], png: d.png };
    return d.paths?.length ? { w: d.w, h: d.h, paths: d.paths } : null;
  } catch {
    return null;
  }
}

export async function saveMySignature(uid: string, name: string, sig: SignatureVector): Promise<void> {
  await setDoc(doc(db, "signatures", uid), { w: sig.w, h: sig.h, paths: sig.png ? [] : sig.paths, ...(sig.png ? { png: sig.png } : {}), name, updatedAt: serverTimestamp() });
}

export function rolesFor(r: MedicalRequest, email: string): MedicalSignRole[] {
  const e = email.toLowerCase();
  const out: MedicalSignRole[] = [];
  if (r.stage === "medical" && r.medicalEmail === e && !r.medicalSign) out.push("medical");
  if (r.stage === "signoff") for (const k of SIGNOFF_ROLES) if (r[`${k}Email` as const] === e && !r[`${k}Sign` as const]) out.push(k);
  return out;
}

export function signOf(r: MedicalRequest, role: MedicalSignRole): MedicalSign | null | undefined {
  return r[`${role}Sign` as const];
}

export function nameOf(r: MedicalRequest, role: MedicalSignRole): string {
  return (role === "medical" ? r.medicalName : r[`${role}Name` as const]) || ROLE_TITLE[role];
}

export function fmtStamp(t?: Timestamp | null): string {
  if (!t?.toDate) return "";
  return t.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
