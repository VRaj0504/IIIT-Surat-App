

const HOLIDAY_NAMES_IST: Record<string, string> = {

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
  "2026-11-08": "Diwali",
  "2026-11-24": "Guru Nanak's Birthday",
  "2026-12-25": "Christmas Day",
};

const DIWALI_BREAK_START = "2026-11-06";
const DIWALI_BREAK_END = "2026-11-13";

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

const NO_CLASS_REASONS = new Map<string, string>();
for (const date of expandDateRange(SEMESTER_BREAK_START, SEMESTER_BREAK_END)) NO_CLASS_REASONS.set(date, "Semester Break");
for (const date of expandDateRange(DIWALI_BREAK_START, DIWALI_BREAK_END)) NO_CLASS_REASONS.set(date, "Diwali Break");
for (const [date, name] of Object.entries(HOLIDAY_NAMES_IST)) NO_CLASS_REASONS.set(date, name);

export function getNoClassReason(todayIsoIST: string): string | null {
  return NO_CLASS_REASONS.get(todayIsoIST) ?? null;
}

export function isNoClassDay(todayIsoIST: string): boolean {
  return NO_CLASS_REASONS.has(todayIsoIST);
}
