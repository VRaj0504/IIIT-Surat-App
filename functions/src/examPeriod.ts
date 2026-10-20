// Knowing when a class is in its exam period, from the date sheets
// faculty publish (the `examSchedules` collection). Two things use it:
//  - sendClassReminderPush stays silent for a class while its exams run
//    (there are no regular classes then, so "Class in 3 minutes" would
//    be wrong);
//  - sendDayStatusPush tells students what today actually is instead.

export type ExamDocEntry = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM 24h
  endTime?: string;
  subjectCode?: string;
  subjectName?: string;
};

export type ExamDoc = {
  branch: string;
  semester: number;
  examType: string;
  examTypeLabel?: string;
  entries: ExamDocEntry[];
};

// Only the regular Mid/End Semester sheets pause classes. A quiz or
// internal is a single hour with classes running around it, and a
// repeaters sheet covers a small subset of students on the same dates the
// regular sheet already covers.
const CLASS_SUSPENDING_TYPES = ["midsem", "endsem"];

export function to12Hour(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

// Same rule as src/utils/academicInfo.ts's getCurrentSemester (odd
// semesters start in July, even in January), evaluated on IST time.
// Same odd/even semester math as src/utils/academicInfo.ts, evaluated
// in IST so a student isn't moved to the next semester up to 5.5 hours
// early/late around the 1 July / 1 January boundary. `program` caps
// the result at 4 (PG/M.Tech, 2 years) instead of 8 (UG, 4 years) --
// this file's own copy went un-updated when that fix was made to the
// main app and web portal; kept in sync now. Keep all three by hand.
export function currentSemester(
  admissionYear: number,
  now: Date = new Date(),
  program: 'UG' | 'PG' = 'UG',
): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const month = ist.getUTCMonth() + 1;
  const year = ist.getUTCFullYear();
  const isOdd = month >= 7;
  const academicYearIndex = isOdd ? year - admissionYear : year - admissionYear - 1;
  const semester = academicYearIndex * 2 + 1 + (isOdd ? 0 : 1);
  const totalSemesters = program === 'PG' ? 4 : 8;
  return Math.min(Math.max(semester, 1), totalSemesters);
}

// The sheet is keyed by CSE/ECE; an MNC student reads the CSE one (same
// rule as the timetable and the exam schedule screen).
export function sheetBranch(branch: string): string {
  return branch.toUpperCase() === "MNC" ? "CSE" : branch;
}

// MNC has its own date sheets; use them for a semester once one exists,
// otherwise the student keeps following the CSE sheet.
export function sheetBranchFor(docs: ExamDoc[], branch: string, semester: number): string {
  if (branch.toUpperCase() !== "MNC") return branch;
  return docs.some((d) => d.branch === "MNC" && d.semester === semester) ? "MNC" : "CSE";
}

function windowOf(doc: ExamDoc): {start: string; end: string} | null {
  const dates = (doc.entries ?? []).map((e) => e.date).filter(Boolean).sort();
  return dates.length ? {start: dates[0], end: dates[dates.length - 1]} : null;
}

// The first exam date to the last is the exam period — the free days in
// between (and a Sunday) are still part of it, not class days.
function activeSheet(docs: ExamDoc[], branch: string, semester: number, dateIso: string): ExamDoc | null {
  return (
    docs.find((d) => {
      if (d.branch !== branch || d.semester !== semester || !CLASS_SUSPENDING_TYPES.includes(d.examType)) return false;
      const w = windowOf(d);
      return !!w && dateIso >= w.start && dateIso <= w.end;
    }) ?? null
  );
}

export function isInExamPeriod(docs: ExamDoc[], branch: string, semester: number, dateIso: string): boolean {
  return activeSheet(docs, branch, semester, dateIso) !== null;
}

// What to tell a class on a day inside its exam period, or null when the
// day isn't in one. Two genuinely different situations, worded so
// they can't be confused for each other at a glance: an actual exam
// today leads with the real subject name right in the title (that's
// the one thing worth seeing without even opening the notification),
// and a gap day — inside the exam period, but nothing scheduled for
// this class today — says "No exam today" plainly, not something that
// still has the word "exam" sitting where it could be misread as "you
// have one today."
export function examDayMessage(
  docs: ExamDoc[],
  branch: string,
  semester: number,
  dateIso: string,
): {title: string; body: string} | null {
  const sheet = activeSheet(docs, branch, semester, dateIso);
  if (!sheet) return null;

  const today = sheet.entries
    .filter((e) => e.date === dateIso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const label = sheet.examTypeLabel ?? "Exam";

  if (today.length === 0) {
    return {
      title: "No exam today",
      body: `You're in the ${label.toLowerCase()} period, but nothing's scheduled for you today. No regular classes either.`,
    };
  }
  const subjectNames = today.map((e) => e.subjectName || e.subjectCode).join(", ");
  const list = today.map((e) => `${e.subjectName || e.subjectCode} at ${to12Hour(e.startTime)}`).join("; ");
  return {
    title: `Exam today: ${subjectNames}`,
    body: `${list}. No regular classes today.`,
  };
}

// The exam collection is a handful of documents, but the class reminder
// runs every minute — a short in-memory cache keeps that from being a
// read of every date sheet every 60 seconds. Five minutes is safe: a
// sheet published mid-day only needs to start pausing reminders a few
// minutes later, and exam periods span days.
let cache: {at: number; docs: ExamDoc[]} | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function loadExamDocs(db: FirebaseFirestore.Firestore): Promise<ExamDoc[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.docs;
  const snap = await db.collection("examSchedules").where("examType", "in", CLASS_SUSPENDING_TYPES).get();
  const docs = snap.docs.map((d) => d.data() as ExamDoc);
  cache = {at: Date.now(), docs};
  return docs;
}
