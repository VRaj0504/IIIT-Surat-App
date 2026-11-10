import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";
import {sameSection, tokensOf, wants, type UserDoc} from "./audience";
import {currentSemester, sheetBranchFor, to12Hour, type ExamDoc} from "./examPeriod";
import {getNoClassReason} from "./holidays";
import {loadHolidayOverrides} from "./holidayOverrides";
import {loadExamDocs, isInExamPeriod} from "./examPeriod";
import {slotTaughtBy} from "./facultyLegend";
import {tally, type Excused, type Session} from "./sendLowAttendancePush";

// Three reminders that run on a clock:
//   sendExamEvePush          7 PM daily      "Exam tomorrow" to the students who have one
//   sendWeeklyAttendancePush 6 PM Sunday     each student's week and overall attendance
//   sendAttendanceNudgePush  6 PM Mon-Sat    teachers who took a class today but haven't marked attendance

const REGION = "asia-south1";
const TZ = "Asia/Kolkata";
const TARGET = 75;

/** A date in India as YYYY-MM-DD, `daysAhead` days from now (negative for the past). */
function istDate(daysAhead = 0): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"})
    .format(new Date(Date.now() + daysAhead * 86400000));
}

function istWeekday(): string {
  return new Intl.DateTimeFormat("en-US", {timeZone: TZ, weekday: "long"}).format(new Date());
}

const squash = (x: unknown) => String(x ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");

/** Runs `work` over `items`, a few at a time, so hundreds of pushes don't all start at once. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map((x) => work(x).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[scheduledNudges] one push failed", err);
    })));
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Exam tomorrow
// ---------------------------------------------------------------------------------------------

export const sendExamEvePush = onSchedule({schedule: "0 19 * * *", timeZone: TZ, region: REGION}, async () => {
  const db = getFirestore();
  const tomorrow = istDate(1);
  const docs = (await db.collection("examSchedules").get()).docs
    .map((d) => d.data() as ExamDoc)
    .filter((d) => Array.isArray(d.entries) && d.entries.some((e) => e.date === tomorrow));
  if (docs.length === 0) return;

  const users = (await db.collection("users").where("role", "==", "student").get()).docs
    .map((d) => d.data() as UserDoc)
    .filter((u) => tokensOf(u).length > 0 && wants(u, "examsAndGrades") && u.branch && u.admissionYear);

  const byClass = new Map<string, {title: string; body: string; tokens: string[]} | null>();
  for (const u of users) {
    const semester = currentSemester(u.admissionYear!, undefined, u.program);
    const branch = sheetBranchFor(docs, u.branch!, semester);
    const key = `${branch}|${semester}`;
    if (!byClass.has(key)) {
      const seen = new Set<string>();
      const entries = docs
        .filter((d) => d.branch === branch && d.semester === semester)
        .flatMap((d) => d.entries.filter((e) => e.date === tomorrow))
        .filter((e) => {
          const k = `${squash(e.subjectCode || e.subjectName)}|${e.startTime}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      byClass.set(key, entries.length === 0 ? null : {
        title: `Exam tomorrow: ${entries.map((e) => e.subjectName || e.subjectCode).join(", ")}`,
        body: `${entries.map((e) => `${e.subjectName || e.subjectCode} at ${to12Hour(e.startTime)}`).join("; ")}. All the best.`,
        tokens: [],
      });
    }
    byClass.get(key)?.tokens.push(...tokensOf(u));
  }

  const groups = Array.from(byClass.values()).filter((g): g is {title: string; body: string; tokens: string[]} => !!g && g.tokens.length > 0);
  await Promise.all(groups.map((g) => sendExpoPush(g.tokens, g.title, g.body, "sendExamEvePush", {screen: "ExamSchedule"})));
});

// ---------------------------------------------------------------------------------------------
// 2. Weekly attendance summary
// ---------------------------------------------------------------------------------------------

/** Approved event excusals and medical leave for everyone, read once, keyed by registration number. */
async function loadAllExcusals(): Promise<Map<string, Excused>> {
  const db = getFirestore();
  const out = new Map<string, Excused>();
  const of = (reg: string) => {
    let e = out.get(reg);
    if (!e) {
      e = {ranges: [], sessions: new Set()};
      out.set(reg, e);
    }
    return e;
  };
  const [events, medical] = await Promise.all([
    db.collection("eventExcusals").where("status", "==", "approved").get(),
    db.collection("medicalExcusals").get(),
  ]);
  events.docs.forEach((d) => {
    const x = d.data() as {
      flow?: number; fullDay?: boolean; fromDate?: string; toDate?: string; studentEnrollmentNumbers?: string[];
      students?: {regNo: string; classKey: string | null}[]; sessionsByClass?: Record<string, string[]> | null;
    };
    if (!x.fromDate || !x.toDate) return;
    for (const reg of x.studentEnrollmentNumbers ?? []) {
      if (x.flow === 2 && x.fullDay === false) {
        const key = x.students?.find((s) => s.regNo === reg)?.classKey;
        ((key && x.sessionsByClass?.[key]) || []).forEach((k) => of(reg).sessions.add(k));
      } else {
        of(reg).ranges.push({from: x.fromDate, to: x.toDate});
      }
    }
  });
  medical.docs.forEach((d) => {
    const x = d.data() as {enrollmentNumber?: string; fromDate?: string | null; toDate?: string | null; sessions?: string[]; allDates?: boolean};
    if (!x.enrollmentNumber) return;
    const e = of(x.enrollmentNumber);
    (x.sessions ?? []).forEach((k) => e.sessions.add(k));
    if (x.allDates && x.fromDate && x.toDate) e.ranges.push({from: x.fromDate, to: x.toDate});
  });
  return out;
}

export const sendWeeklyAttendancePush = onSchedule(
  {schedule: "0 18 * * 0", timeZone: TZ, region: REGION, timeoutSeconds: 540, memory: "512MiB"},
  async () => {
    const db = getFirestore();
    const today = istDate(0);
    const weekStart = istDate(-6);
    // Only this semester's classes count: July-December or January-June.
    const [year, month] = today.split("-").map(Number);
    const semesterStart = `${year}-${month >= 7 ? "07" : "01"}-01`;

    const [usersSnap, sessionsSnap, excusals] = await Promise.all([
      db.collection("users").where("role", "==", "student").get(),
      db.collection("attendanceSessions").where("date", ">=", semesterStart).get(),
      loadAllExcusals(),
    ]);

    const byClass = new Map<string, Session[]>();
    sessionsSnap.docs.forEach((d) => {
      const s = d.data() as Session;
      if (!s.branch || !s.admissionYear || !s.subjectCode || !s.date) return;
      const key = `${s.branch}|${s.admissionYear}|${s.section ?? ""}`;
      byClass.set(key, [...(byClass.get(key) ?? []), s]);
    });

    type Job = {tokens: string[]; body: string};
    const jobs: Job[] = [];
    usersSnap.docs.forEach((d) => {
      const u = d.data() as UserDoc;
      const reg = u.enrollmentNumber;
      const tokens = tokensOf(u);
      if (!reg || !u.branch || !u.admissionYear || tokens.length === 0 || !wants(u, "attendanceAlerts")) return;
      const mine = (byClass.get(`${u.branch}|${u.admissionYear}|${u.section ?? ""}`) ?? [])
        .filter((s) => !s.specialization || !u.specialization || s.specialization === u.specialization);
      if (mine.length === 0) return;
      const ex = excusals.get(reg);

      const overall = tally(mine, reg, ex);
      const week = tally(mine.filter((s) => (s.date ?? "") >= weekStart && (s.date ?? "") <= today), reg, ex);
      if (overall.total === 0) return;

      const bySubject = new Map<string, Session[]>();
      mine.forEach((s) => bySubject.set(s.subjectCode!, [...(bySubject.get(s.subjectCode!) ?? []), s]));
      const low = Array.from(bySubject.entries())
        .map(([code, list]) => ({code, t: tally(list, reg, ex)}))
        .filter((x) => x.t.total > 0 && (x.t.present / x.t.total) * 100 < TARGET)
        .map((x) => x.code);

      // Nothing happened this week and nothing is low: no need to ping.
      if (week.total === 0 && low.length === 0) return;

      const pct = Math.round((overall.present / overall.total) * 1000) / 10;
      const weekLine = week.total > 0 ?
        `You attended ${week.present} of ${week.total} class hours this week.` :
        "No classes were marked this week.";
      const lowLine = low.length > 0 ?
        ` Below ${TARGET}%: ${low.slice(0, 4).join(", ")}${low.length > 4 ? ` and ${low.length - 4} more` : ""}.` :
        ` Every subject is at ${TARGET}% or above.`;
      jobs.push({tokens, body: `${weekLine} Overall ${pct}%.${lowLine}`});
    });

    // eslint-disable-next-line no-console
    console.log(`[sendWeeklyAttendancePush] ${jobs.length} students to notify`);
    await inBatches(jobs, 25, (j) =>
      sendExpoPush(j.tokens, "Your attendance this week", j.body, "sendWeeklyAttendancePush", {screen: "MyAttendance"}));
  },
);

// ---------------------------------------------------------------------------------------------
// 3. Teachers: attendance not marked today
// ---------------------------------------------------------------------------------------------

type Slot = {startTime: string; endTime?: string; subjectCode: string; subjectName?: string; faculty?: string};
type Timetable = {branch: string; semester: number; section: string; days?: {day: string; slots?: Slot[]}[]};
type ClassChange = {date: string; branch: string; section: string | null; subjectCode: string; type: "cancelled" | "room"};

function classLabel(tt: Timetable): string {
  const section = String(tt.section ?? "").trim();
  const showSection = section && section.toUpperCase() !== String(tt.branch).toUpperCase();
  return `${tt.branch} Sem ${tt.semester}${showSection ? ` ${section}` : ""}`;
}

export const sendAttendanceNudgePush = onSchedule(
  {schedule: "0 18 * * 1-6", timeZone: TZ, region: REGION, timeoutSeconds: 300},
  async () => {
    const db = getFirestore();
    const today = istDate(0);
    const weekday = istWeekday().slice(0, 3).toLowerCase();
    const overrides = await loadHolidayOverrides(db);
    if (getNoClassReason(today) || overrides.has(today)) return;

    const [ttSnap, facultySnap, sessionsSnap, changesSnap, examDocs] = await Promise.all([
      db.collection("timetable").get(),
      db.collection("users").where("role", "==", "faculty").get(),
      db.collection("attendanceSessions").where("date", "==", today).get(),
      db.collection("classChanges").where("date", "==", today).get(),
      loadExamDocs(db),
    ]);
    const sessions = sessionsSnap.docs.map((d) => d.data() as Session & {semester?: number});
    const cancelled = changesSnap.docs.map((d) => d.data() as ClassChange).filter((c) => c.type === "cancelled");

    // Every (class, subject) that was on today's timetable and wasn't cancelled.
    type Due = {tt: Timetable; slot: Slot};
    const due: Due[] = [];
    ttSnap.docs.forEach((d) => {
      const tt = d.data() as Timetable;
      if (!tt.branch || !tt.semester) return;
      if (isInExamPeriod(examDocs, tt.branch, tt.semester, today)) return;
      const day = tt.days?.find((x) => String(x.day ?? "").trim().slice(0, 3).toLowerCase() === weekday);
      const seen = new Set<string>();
      (day?.slots ?? []).forEach((slot) => {
        const code = squash(slot.subjectCode);
        if (!code || !slot.faculty || seen.has(code)) return;
        seen.add(code);
        const isCancelled = cancelled.some((c) =>
          squash(c.subjectCode) === code && squash(c.branch) === squash(tt.branch) &&
          (!c.section || sameSection(tt.branch, c.section, tt.section)));
        if (!isCancelled) due.push({tt, slot});
      });
    });

    const marked = (x: Due) => sessions.some((s) => {
      if (squash(s.subjectCode) !== squash(x.slot.subjectCode) || squash(s.branch) !== squash(x.tt.branch)) return false;
      const sem = s.semester ?? (s.admissionYear ? currentSemester(s.admissionYear) : null);
      if (sem !== null && sem !== x.tt.semester) return false;
      return !s.section || sameSection(x.tt.branch, s.section, x.tt.section);
    });
    const pending = due.filter((x) => !marked(x));
    if (pending.length === 0) return;

    const jobs: {tokens: string[]; title: string; body: string}[] = [];
    facultySnap.docs.forEach((d) => {
      const f = d.data() as UserDoc;
      const tokens = tokensOf(f);
      if (!f.name || tokens.length === 0 || !wants(f, "classReminders")) return;
      const mine = pending.filter((x) => slotTaughtBy(x.slot.faculty ?? "", f.name!));
      if (mine.length === 0) return;
      // The same subject taught to two sections at once is one line.
      const bySubject = new Map<string, Due[]>();
      mine.forEach((x) => bySubject.set(squash(x.slot.subjectCode), [...(bySubject.get(squash(x.slot.subjectCode)) ?? []), x]));
      const lines = Array.from(bySubject.values()).map((list) => {
        const s = list[0].slot;
        const classes = Array.from(new Set(list.map((x) => classLabel(x.tt)))).join(" + ");
        return `${s.subjectName || s.subjectCode} (${s.subjectCode}) · ${classes}`;
      });
      jobs.push({
        tokens,
        title: lines.length === 1 ? "Attendance not marked for 1 class today" : `Attendance not marked for ${lines.length} classes today`,
        body: `${lines.join("\n")}\nMark it from the app or the faculty portal.`,
      });
    });

    // eslint-disable-next-line no-console
    console.log(`[sendAttendanceNudgePush] ${today}: ${pending.length} class(es) unmarked, ${jobs.length} teacher(s) to remind`);
    await inBatches(jobs, 25, (j) => sendExpoPush(j.tokens, j.title, j.body, "sendAttendanceNudgePush", {screen: "Home"}));
  },
);
