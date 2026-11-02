import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {tokensOf, type UserDoc} from "./audience";

type Upload = {
  subjectCode?: string;
  subjectName?: string;
  components?: {label?: string; max?: number}[];
  regNos?: string[];
  notify?: boolean;
};

export const sendMarksPush = onDocumentCreated("marksUploads/{uploadId}", async (event) => {
  const u = event.data?.data() as Upload | undefined;
  if (!u || u.notify === false || !Array.isArray(u.regNos) || !u.regNos.length) return;
  const want = new Set(u.regNos.map((r) => String(r).toUpperCase()));
  const snap = await getFirestore().collection("users").where("role", "==", "student").get();
  const tokens: string[] = [];
  snap.docs.forEach((d) => {
    const s = d.data() as UserDoc;
    if (!want.has(String(s.enrollmentNumber ?? "").toUpperCase())) return;
    if (s.notificationPreferences?.examsAndGrades === false) return;
    tokens.push(...tokensOf(s));
  });
  const what = (u.components ?? []).map((c) => c.label).filter(Boolean).join(" & ") || "Marks";
  await sendExpoPush(
    tokens,
    `${what} marks are out`,
    `${u.subjectName || u.subjectCode || "A subject"}${u.subjectCode && u.subjectName ? ` (${u.subjectCode})` : ""} — tap to see your score.`,
    "sendMarksPush",
    {screen: "Marks"},
  );
});
