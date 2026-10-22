import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {getNoClassReason} from "./holidays";
import {loadHolidayOverrides} from "./holidayOverrides";
import {loadExamDocs, examDayMessage, currentSemester, sheetBranchFor} from "./examPeriod";
import {sendExpoPush} from "./expoPush";

function istDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

type NotifiableUser = {
  role?: string;
  branch?: string;
  admissionYear?: number;
  program?: 'UG' | 'PG';
  expoPushToken?: string;
  notificationPreferences?: {classReminders?: boolean};
};

export const sendDayStatusPush = onSchedule(
  {

    schedule: "30 7 * * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const todayIso = istDateIso();
    const holidayOverrides = await loadHolidayOverrides(db);

    const holiday = getNoClassReason(todayIso) ?? holidayOverrides.get(todayIso) ?? null;

    const snap = await db.collection("users").where("role", "in", ["student", "faculty"]).get();
    const users = snap.docs
      .map((d) => d.data() as NotifiableUser)
      .filter((u) => u.expoPushToken && u.notificationPreferences?.classReminders !== false);

    // eslint-disable-next-line no-console
    console.log(`[sendDayStatusPush] ${todayIso}: holiday=${holiday ?? "none"}, ${snap.size} users, ${users.length} with push token`);
    if (holiday) {
      await sendExpoPush(
        users.map((u) => u.expoPushToken as string),
        "No classes today",
        `Holiday today: ${holiday}.`,
        "sendDayStatusPush",
      );
      return;
    }

    const docs = await loadExamDocs(db);
    if (docs.length === 0) return;

    const byClass = new Map<string, {title: string; body: string; tokens: string[]}>();
    for (const u of users) {
      if (u.role !== "student" || !u.branch || !u.admissionYear) continue;
      const semester = currentSemester(u.admissionYear, undefined, u.program);
      const branch = sheetBranchFor(docs, u.branch, semester);
      const key = `${branch}|${semester}`;
      let entry = byClass.get(key);
      if (!entry) {
        const message = examDayMessage(docs, branch, semester, todayIso);
        if (!message) {
          byClass.set(key, {title: "", body: "", tokens: []});
          continue;
        }
        entry = {...message, tokens: []};
        byClass.set(key, entry);
      }
      if (entry.title) entry.tokens.push(u.expoPushToken as string);
    }

    await Promise.all(
      Array.from(byClass.values())
        .filter((e) => e.title && e.tokens.length > 0)
        .map((e) => sendExpoPush(e.tokens, e.title, e.body, "sendDayStatusPush")),
    );
  },
);
