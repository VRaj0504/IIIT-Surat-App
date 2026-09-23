// Mirrors src/data/academicCalendar.ts's "Public Holidays" and break
// periods — duplicated here for the same cross-project-import reason as
// FACULTY_LEGEND/getCurrentSemester in sendClassReminderPush.ts:
// functions/ is a separate TypeScript project with its own build, so it
// can't import straight from src/.
//
// Deliberately excludes "Restricted Holidays" — those are each
// individually optional (any two can be availed, per that section's own
// note), not a campus-wide day off. Classes still run for everyone who
// didn't personally take that day, so suppressing reminders campus-wide
// on a Restricted Holiday would be wrong in the other direction: a
// student who DIDN'T take it as their day off would stop getting
// reminders for a class that's actually happening.
//
// KEEP THIS IN SYNC with src/data/academicCalendar.ts by hand, once a
// year when that file's dates are updated for the new academic year —
// there's no other link between the two.
const HOLIDAY_NAMES_IST: Record<string, string> = {
  // Public Holidays 2026 (single days)
  "2026-01-26": "Republic Day",
  "2026-03-04": "Holi",
  "2026-03-21": "Id-ul-Fitr",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Prophet Mohammad's Birthday (Id-e-Milad)",
  "2026-08-28": "Rakshabandhan",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Mahatma Gandhi's Birthday",
  "2026-10-20": "Dussehra (Vijay Dashami)",
  "2026-11-08": "Diwali", // also covered by the Diwali Break range below
  "2026-11-24": "Guru Nanak's Birthday",
  "2026-12-25": "Christmas Day", // also covered by Semester Break below
};

// Diwali Break for Students and Faculty: 6th Nov (Fri) to 13th Nov (Fri), 2026 — inclusive.
const DIWALI_BREAK_START = "2026-11-06";
const DIWALI_BREAK_END = "2026-11-13";

// Semester Break (Vacation): the broader of the student/faculty ranges —
// 14th Dec (Mon), 2026 through 1st Jan (Fri), 2027 — inclusive. No live
// timetable would realistically be in play this late in the semester
// anyway (End-Semester exams run through 12th Dec), but this is here for
// the same reason the Public Holidays are: campus-wide, not a matter of
// individual choice.
const SEMESTER_BREAK_START = "2026-12-14";
const SEMESTER_BREAK_END = "2027-01-01";

function expandDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// date -> what to call it in a message ("Ganesh Chaturthi", "Diwali Break").
// A named public holiday wins over a break that covers the same date.
const NO_CLASS_REASONS = new Map<string, string>();
for (const date of expandDateRange(SEMESTER_BREAK_START, SEMESTER_BREAK_END)) NO_CLASS_REASONS.set(date, "Semester Break");
for (const date of expandDateRange(DIWALI_BREAK_START, DIWALI_BREAK_END)) NO_CLASS_REASONS.set(date, "Diwali Break");
for (const [date, name] of Object.entries(HOLIDAY_NAMES_IST)) NO_CLASS_REASONS.set(date, name);

// today must already be the IST calendar date as "YYYY-MM-DD" — callers
// derive this from Asia/Kolkata wall-clock time (see
// istWeekdayAndTimePlusMinutes in sendClassReminderPush.ts), not from
// whatever timezone the function's container happens to run in.
export function getNoClassReason(todayIsoIST: string): string | null {
  return NO_CLASS_REASONS.get(todayIsoIST) ?? null;
}

export function isNoClassDay(todayIsoIST: string): boolean {
  return NO_CLASS_REASONS.has(todayIsoIST);
}
