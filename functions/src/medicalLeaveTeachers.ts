// Pure logic for the last step of a medical leave: given the student's
// timetable and the leave dates, which teachers' classes did they miss,
// and on which dates? No Firebase in here, so it can be tested on its own
// against the real seed timetable.

export type TTSlot = {
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  faculty: string;
  room: string;
  group?: string;
};

export type TTDay = {day: string; slots: TTSlot[]};

export type FacultyRef = {email: string; name: string};

export type TeacherSubject = {code: string; name: string; dates: string[]};

export type TeacherTask = {email: string; name: string; subjects: TeacherSubject[]};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "YYYY-MM-DD" -> "Monday". Pure calendar arithmetic in UTC, so the
// server's own timezone can never shift a date by one.
export function weekdayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Every calendar date from..to inclusive. Capped so a typo like a
// 2062 end date can't make the function loop for decades.
export function datesInRange(fromIso: string, toIso: string, maxDays = 62): string[] {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const start = parse(fromIso);
  const end = parse(toIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const out: string[] = [];
  for (let t = start; t <= end && out.length < maxDays; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// "DN/PJM", "DN, PJM", "DN & PJM" -> ["DN", "PJM"]
export function splitFaculty(faculty: string): string[] {
  return String(faculty ?? "")
    .split(/[/,&;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function sameDay(a: string, b: string): boolean {
  const norm = (s: string) => String(s ?? "").trim().slice(0, 3).toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

// Initials as printed in a timetable -> a comparable key ("D.N" == "DN").
export const initialsKey = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Names -> a comparable key ("Dr. Nidhi  Desai" == "nidhi desai").
export function nameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Builds "timetable initials -> faculty account" from the faculty
// allowlist. Two routes, first match wins:
//   1. the allowlist entry's own shortForm ("DN") — the most reliable;
//   2. the shared initials legend (facultyLegend.ts) gives a full name,
//      matched against the allowlist entry's name.
export function buildFacultyResolver(
  allowlist: {email: string; name?: string; shortForm?: string}[],
  legendLookup: (initials: string) => string | undefined,
): (initials: string) => FacultyRef | null {
  const byShort = new Map<string, FacultyRef>();
  const byName = new Map<string, FacultyRef>();
  for (const a of allowlist) {
    const ref = {email: a.email.toLowerCase(), name: (a.name ?? a.email).trim()};
    if (a.shortForm) {
      const k = initialsKey(a.shortForm);
      if (k && !byShort.has(k)) byShort.set(k, ref);
    }
    if (a.name) {
      const k = nameKey(a.name);
      if (k && !byName.has(k)) byName.set(k, ref);
    }
  }
  return (initials: string) => {
    const k = initialsKey(initials);
    if (!k) return null;
    const viaShort = byShort.get(k);
    if (viaShort) return viaShort;
    const legendName = legendLookup(initials);
    if (legendName) {
      const key = nameKey(legendName);
      const viaName = byName.get(key);
      if (viaName) return viaName;
      // Middle names differ between sources ("Manish Rai" in the legend,
      // "Dr. Manish Kumar Rai" on the allowlist): accept a match when
      // every word of the legend name appears in exactly ONE allowlist
      // name — never guess between two candidates.
      const words = key.split(" ").filter(Boolean);
      if (words.length >= 2) {
        const hits = Array.from(byName.entries()).filter(([k]) => {
          const have = new Set(k.split(" "));
          return words.every((w) => have.has(w));
        });
        if (hits.length === 1) return hits[0][1];
      }
    }
    return null;
  };
}

// The core of step 3. For every leave date the college actually holds
// classes (isNoClassDay filters holidays/weekends-with-no-slots), every
// slot in the student's timetable that day is a class they missed; each
// person named in that slot's faculty field gets it on their list.
//
// A lab split into Group 1 / Group 2 has no record of which group THIS
// student is in, so both groups' teachers are included — a teacher
// whose group the student isn't in simply confirms nothing changes.
export function computeTeacherTasks(
  days: TTDay[],
  dates: string[],
  resolve: (initials: string) => FacultyRef | null,
  isNoClassDay: (dateIso: string) => boolean,
): {tasks: TeacherTask[]; unmatched: string[]} {
  const byEmail = new Map<string, {name: string; subjects: Map<string, TeacherSubject>}>();
  const unmatched = new Set<string>();

  for (const date of dates) {
    if (isNoClassDay(date)) continue;
    const weekday = weekdayOf(date);
    const dayEntry = days.find((d) => sameDay(d.day, weekday));
    if (!dayEntry) continue;
    for (const slot of dayEntry.slots ?? []) {
      const code = String(slot.subjectCode ?? "").trim() || String(slot.subjectName ?? "").trim();
      if (!code) continue;
      for (const initials of splitFaculty(slot.faculty)) {
        const ref = resolve(initials);
        if (!ref) {
          unmatched.add(initials);
          continue;
        }
        let entry = byEmail.get(ref.email);
        if (!entry) {
          entry = {name: ref.name, subjects: new Map()};
          byEmail.set(ref.email, entry);
        }
        let subj = entry.subjects.get(code);
        if (!subj) {
          subj = {code, name: String(slot.subjectName ?? "").trim() || code, dates: []};
          entry.subjects.set(code, subj);
        }
        // A lab and its lecture often share one code ("PPS Lab" + "PPS").
        const slotName = String(slot.subjectName ?? "").trim();
        if (slotName && !subj.name.split(" / ").includes(slotName)) subj.name = `${subj.name} / ${slotName}`;
        if (!subj.dates.includes(date)) subj.dates.push(date);
      }
    }
  }

  const tasks: TeacherTask[] = Array.from(byEmail.entries())
    .map(([email, e]) => ({
      email,
      name: e.name,
      subjects: Array.from(e.subjects.values()).map((s) => ({...s, dates: [...s.dates].sort()})),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {tasks, unmatched: Array.from(unmatched).sort()};
}

// "CS304|2026-10-19" — one excused class session. Used by the app's
// attendance calculation (attendanceService.ts) once a teacher confirms.
export function excusedSessionKeys(subjects: TeacherSubject[]): string[] {
  const out: string[] = [];
  for (const s of subjects) for (const d of s.dates) out.push(`${s.code}|${d}`);
  return out;
}

// Mirrors src/utils/academicInfo.ts's getCurrentSemester (functions/ is
// a separate TS project and can't import from src/).
export function semesterOn(admissionYear: number, dateIso: string): number {
  const [y, m] = dateIso.split("-").map(Number);
  const isOdd = m >= 7;
  const yearIndex = isOdd ? y - admissionYear : y - admissionYear - 1;
  return yearIndex * 2 + 1 + (isOdd ? 0 : 1);
}
