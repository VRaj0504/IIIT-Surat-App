

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

export function weekdayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

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

export const initialsKey = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function nameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

export function excusedSessionKeys(subjects: TeacherSubject[]): string[] {
  const out: string[] = [];
  for (const s of subjects) for (const d of s.dates) out.push(`${s.code}|${d}`);
  return out;
}

export function semesterOn(admissionYear: number, dateIso: string): number {
  const [y, m] = dateIso.split("-").map(Number);
  const isOdd = m >= 7;
  const yearIndex = isOdd ? y - admissionYear : y - admissionYear - 1;
  return yearIndex * 2 + 1 + (isOdd ? 0 : 1);
}
