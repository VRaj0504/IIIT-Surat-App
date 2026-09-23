import type { ExamSchedule } from "../firebase/examScheduleService";

// What today is, for the "Classes today" card on Home: a holiday or a
// class's exam period shows as exactly that, instead of a misleading
// "0" or the count of a weekly timetable that isn't running today.
// Mirrors functions/src/holidays.ts and functions/src/examPeriod.ts (which
// decide when class reminders stay silent) — same dates, same rule.
// KEEP THE HOLIDAY LIST IN SYNC with those by hand once a year.

const PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-01-26": "Republic Day",
  "2026-03-04": "Holi",
  "2026-03-21": "Id-ul-Fitr",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Id-e-Milad",
  "2026-08-28": "Rakshabandhan",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali",
  "2026-11-24": "Guru Nanak Jayanti",
  "2026-12-25": "Christmas",
};

const BREAKS: { start: string; end: string; name: string }[] = [
  { start: "2026-11-06", end: "2026-11-13", name: "Diwali Break" },
  { start: "2026-12-14", end: "2027-01-01", name: "Semester Break" },
];

// Only the regular Mid/End Semester sheets pause classes (a quiz is an
// hour with classes around it; repeaters share the regular dates).
const CLASS_SUSPENDING_TYPES = ["midsem", "endsem"];

export type DayStatus = { short: string; label: string };

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getHolidayName(iso: string): string | null {
  if (PUBLIC_HOLIDAYS[iso]) return PUBLIC_HOLIDAYS[iso];
  return BREAKS.find((b) => iso >= b.start && iso <= b.end)?.name ?? null;
}

// The first exam date to the last is the exam period; the free days in
// between (and a Sunday) are part of it, not class days.
function inExamPeriod(schedules: ExamSchedule[], iso: string): boolean {
  return schedules.some((s) => {
    if (!CLASS_SUSPENDING_TYPES.includes(s.examType)) return false;
    const dates = s.entries.map((e) => e.date).filter(Boolean).sort();
    return dates.length > 0 && iso >= dates[0] && iso <= dates[dates.length - 1];
  });
}

export function getDayStatus(now: Date, schedules: ExamSchedule[]): DayStatus | null {
  const iso = toIso(now);
  const holiday = getHolidayName(iso);
  if (holiday) return { short: "Off", label: `Holiday · ${holiday}` };
  if (inExamPeriod(schedules, iso)) return { short: "Exams", label: "Exam period · no classes" };
  return null;
}
