import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {studentsFor} from "./audience";
import {sendExpoPush} from "./expoPush";

type Quiz = {
  title?: string;
  subjectCode?: string;
  subjectName?: string;
  branch: string;
  admissionYear: number;
  sections?: string[];
  date: string;
  startTime: string;
  endTime: string;
  rooms?: {room: string; fromRegNo: string; toRegNo: string}[];
};

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const sendQuizPush = onDocumentWritten("quizzes/{quizId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const quiz = after.data() as Quiz;
  const before = event.data?.before?.exists ? (event.data.before.data() as Quiz) : null;
  const key = (q: Quiz | null) => q ? JSON.stringify([q.date, q.startTime, q.endTime, q.rooms ?? [], q.sections ?? []]) : "";
  if (before && key(before) === key(quiz)) return;

  const sections = quiz.sections ?? [];
  const branches = sections.length && String(quiz.branch).toUpperCase() === "CSE" ? ["CSE", "MNC"] : [quiz.branch];
  const {matched} = await studentsFor({branches, admissionYears: [Number(quiz.admissionYear)], sections});
  const byToken: {token: string; reg: string}[] = [];
  matched.forEach((r) => {
    if (r.user.notificationPreferences?.examsAndGrades === false) return;
    r.tokens.forEach((token) => byToken.push({token, reg: (r.user.enrollmentNumber ?? "").toUpperCase()}));
  });
  if (byToken.length === 0) return;

  const name = quiz.title || `${quiz.subjectName ?? quiz.subjectCode ?? "Quiz"} quiz`;
  const when = `${prettyDate(quiz.date)}, ${to12h(quiz.startTime)}–${to12h(quiz.endTime)}`;
  const rooms = quiz.rooms ?? [];
  const groups = new Map<string, string[]>();
  for (const {token, reg} of byToken) {
    const r = rooms.find((x) => reg >= x.fromRegNo.toUpperCase() && reg <= x.toRegNo.toUpperCase());
    const body = `${when}${r ? ` · Your room: ${r.room}` : ""}. Tap for syllabus and seating.`;
    groups.set(body, [...(groups.get(body) ?? []), token]);
  }
  await Promise.all(
    Array.from(groups.entries()).map(([body, tokens]) =>
      sendExpoPush(tokens, before ? `Quiz updated: ${name}` : `New quiz: ${name}`, body, "sendQuizPush", {screen: "ExamSchedule"}),
    ),
  );
});
