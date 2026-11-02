export type SignatureVector = {w: number; h: number; paths: string[]; png?: string};

export type MedicalSignRole = "medical" | "hod" | "dean" | "jr";

export type MedicalSign = {
  decision: "approved" | "not_approved";
  comment?: string | null;
  byUid: string;
  byName: string;
  byEmail: string;
  designation?: string | null;
  signature: SignatureVector;
  at?: FirebaseFirestore.Timestamp | null;
};

export type MedicalAttachment = {
  id: string;
  kind: "report" | "intimation" | "certificate" | "other";
  name: string;
  path: string;
  contentType: string;
  size: number;
  uploadedAt: number;
  byUid: string;
  byRole: "student" | "medical";
};

export type OfficeReview = {
  action: "forwarded" | "returned";
  note?: string | null;
  byUid: string;
  byName: string;
  at?: FirebaseFirestore.Timestamp | null;
};

export type MedicalStage2 =
  | "office"
  | "returned"
  | "medical"
  | "signoff"
  | "teachers"
  | "done"
  | "rejected"
  | "withdrawn";

export type MedicalRequest = {
  type: "medical";
  flow: 2;
  stage: MedicalStage2;
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
  attachments?: MedicalAttachment[];
  officeEmail: string;
  medicalEmail: string;
  medicalName?: string | null;
  hodEmail: string;
  hodName?: string | null;
  hodDepartment?: string | null;
  deanEmail: string;
  deanName?: string | null;
  jrEmail: string;
  jrName?: string | null;
  officeReview?: OfficeReview | null;
  medicalSign?: MedicalSign | null;
  hodSign?: MedicalSign | null;
  deanSign?: MedicalSign | null;
  jrSign?: MedicalSign | null;
  late?: boolean;
  daysAfterRejoining?: number | null;
  intimationLate?: boolean;
  intimationMissing?: boolean;
  viewerEmails?: string[];
  pendingEmails?: string[];
  returnNote?: string | null;
  returnedBy?: string | null;
  resubmissions?: number;
  formVersion?: number;
  finalDecision?: "approved" | "not_approved" | null;
  formPdfPath?: string | null;
  formPdfHash?: string | null;
  bundlePath?: string | null;
  createdAt?: FirebaseFirestore.Timestamp | null;
  submittedAt?: FirebaseFirestore.Timestamp | null;
  decidedAt?: FirebaseFirestore.Timestamp | null;
};

export const SIGN_ROLES: MedicalSignRole[] = ["medical", "hod", "dean", "jr"];
export const SIGNOFF_ROLES: MedicalSignRole[] = ["hod", "dean", "jr"];

export const ROLE_TITLE: Record<MedicalSignRole, string> = {
  medical: "Medical Officer",
  hod: "HOD",
  dean: "Associate Dean (Academics)",
  jr: "Joint Registrar",
};

export const LATE_LIMIT_DAYS = 4;
