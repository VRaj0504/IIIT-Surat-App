import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {getNoClassReason} from "./holidays";
import {loadHolidayOverrides} from "./holidayOverrides";
import {loadExamDocs, examDayMessage, currentSemester, sheetBranchFor} from "./examPeriod";
import {sendExpoPush} from "./expoPush";

// The replacement for "Class in 3 minutes" on days there ARE no classes.
// sendClassReminderPush stays silent on a holiday or while a class's
// exams run; this is the one message that says why, instead of leaving
// people wondering whether the app broke:
//   holiday      -> everyone (students and faculty): "Holiday today: ..."
//   exam period  -> each class: what's on today, if anything
// Nothing is sent on an ordinary class day, and nothing on a weekend
// (there are no classes to be confused about). Follows the same
// "Class reminders" switch in Notification Settings — someone who turned
// those off doesn't get this either.
function istDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
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
    // 7:30 AM IST, Monday to Friday.
    // Runs every day, not just Mon-Fri — exams (unlike regular classes,
    // which really are Mon-Fri only in this data) sometimes land on a
    // Saturday or Sunday, and a weekday-only schedule would silently
    // never announce one. The function's own holiday/no-class checks
    // below already handle a genuine day off correctly either way.
    schedule: "30 7 * * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const todayIso = istDateIso();
    const holidayOverrides = await loadHolidayOverrides(db);
    // A fixed-calendar holiday and an ad-hoc one should never both be
    // set for the same date in practice, but if they somehow were, the
    // fixed calendar's name wins — it's the one that went through
    // review when the year's dates were first entered, not a same-day
    // manual add.
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

    // One message per class (branch + semester), sent to that class only.
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
          byClass.set(key, {title: "", body: "", tokens: []}); // remember "nothing to say" for this class
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
