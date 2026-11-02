import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {studentsFor, tokensFor} from "./audience";
import {sendExpoPush} from "./expoPush";

const TYPE_LABELS: Record<string, string> = {
  supplementary: "Supplementary exam",
  makeup: "Make-up exam",
  endsem: "End-semester exam",
  midsem: "Mid-semester exam",
  roomchange: "Room / timing change",
  other: "Exam notice",
};

export const sendExamEventPush = onDocumentCreated(
  "examEvents/{eventId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const exam = snap.data() as {
      title?: string;
      type?: string;
      branches?: string[];
      admissionYears?: number[];
      registration?: string;
      active?: boolean;
    };
    if (exam.active !== true || !exam.title) return;

    const branches = Array.isArray(exam.branches) ? exam.branches : [];
    const years = Array.isArray(exam.admissionYears) ? exam.admissionYears : [];

    const {matched} = await studentsFor({branches, admissionYears: years});
    const tokens = tokensFor(matched, "examsAndGrades");

    const label = TYPE_LABELS[exam.type ?? "other"] ?? "Exam notice";
    const body = exam.registration && exam.registration !== "none" ?
      `${exam.title} — register in CollegeGo before the deadline.` :
      exam.title;

    await sendExpoPush(tokens, label, body, "sendExamEventPush", {screen: "ExamStatus"});
  },
);

type Ev = {
  title?: string;
  type?: string;
  details?: string;
  branches?: string[];
  admissionYears?: number[];
  registration?: string;
  active?: boolean;
  deadline?: {toMillis?: () => number} | null;
  link?: string | null;
};

export const sendExamEventUpdatePush = onDocumentUpdated(
  "examEvents/{eventId}",
  async (event) => {
    const before = event.data?.before.data() as Ev | undefined;
    const after = event.data?.after.data() as Ev | undefined;
    if (!before || !after || after.active !== true || !after.title) return;
    const ms = (d: Ev["deadline"]) => (d && typeof d.toMillis === "function" ? d.toMillis() : null);
    const reopened = before.active !== true;
    const deadlineMoved = ms(before.deadline) !== ms(after.deadline);
    const changed = reopened || deadlineMoved ||
      before.title !== after.title || (before.details ?? "") !== (after.details ?? "") || (before.link ?? null) !== (after.link ?? null);
    if (!changed) return;

    const branches = Array.isArray(after.branches) ? after.branches : [];
    const years = Array.isArray(after.admissionYears) ? after.admissionYears : [];
    const {matched} = await studentsFor({branches, admissionYears: years});
    const tokens = tokensFor(matched, "examsAndGrades");

    const label = TYPE_LABELS[after.type ?? "other"] ?? "Exam notice";
    const dl = ms(after.deadline);
    const when = dl ? new Date(dl).toLocaleDateString("en-IN", {day: "numeric", month: "short", timeZone: "Asia/Kolkata"}) : "";
    const body = reopened ? `${after.title} — registration is open again${when ? ` till ${when}` : ""}.` :
      deadlineMoved && when ? `${after.title} — deadline is now ${when}.` :
        `${after.title} — details updated. Tap to see what changed.`;
    await sendExpoPush(tokens, `${label} updated`, body, "sendExamEventUpdatePush", {screen: "ExamStatus"});
  },
);
