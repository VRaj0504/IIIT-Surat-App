import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

const TYPE_LABELS: Record<string, string> = {
  supplementary: "Supplementary exam",
  makeup: "Make-up exam",
  endsem: "End-semester exam",
  midsem: "Mid-semester exam",
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

    const snapshot = await getFirestore().collection("users").where("role", "==", "student").get();
    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const s = doc.data() as {
        branch?: string;
        admissionYear?: number;
        expoPushToken?: string;
        reviewer?: boolean;
        notificationPreferences?: {examsAndGrades?: boolean};
      };
      if (!s.expoPushToken || s.reviewer === true) return;
      if (s.notificationPreferences?.examsAndGrades === false) return;
      if (branches.length > 0 && (!s.branch || !branches.includes(s.branch))) return;
      if (years.length > 0 && (!s.admissionYear || !years.includes(s.admissionYear))) return;
      tokens.push(s.expoPushToken);
    });

    const label = TYPE_LABELS[exam.type ?? "other"] ?? "Exam notice";
    const body = exam.registration && exam.registration !== "none" ?
      `${exam.title} — register in CollegeGo before the deadline.` :
      exam.title;

    await sendExpoPush(tokens, label, body, "sendExamEventPush", {screen: "ExamStatus"});
  },
);
