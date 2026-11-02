export type PlanSlot = { subjectCode: string; subjectName?: string; startTime: string; endTime: string };
export type PlanDay = { day: string; slots: PlanSlot[] };
export type AttendanceRow = { subjectCode: string; subjectName: string; presentCount: number; totalSessions: number };
export type Projection = {
  code: string;
  name: string;
  nowPct: number | null;
  afterPct: number | null;
  missed: number;
  attendBefore: number;
  needAfter: number;
};

export const TARGET = 75;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const normCode = (c: string) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
export const baseCode = (c: string) => normCode(c).replace(/^([A-Z]{2,4}\d{3})[TP]$/, "$1");

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n));
}

const minutes = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function classesBetween(
  days: PlanDay[],
  fromIso: string,
  toIso: string,
  isHoliday: (iso: string) => boolean,
): { counts: Map<string, number>; names: Map<string, string>; dates: { date: string; codes: string[] }[] } {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  const dates: { date: string; codes: string[] }[] = [];
  if (!fromIso || !toIso || fromIso > toIso) return { counts, names, dates };
  let iso = fromIso;
  for (let i = 0; iso <= toIso && i < 200; i++, iso = addDays(iso, 1)) {
    const [y, m, d] = iso.split("-").map(Number);
    const dayName = DAY_NAMES[new Date(y, m - 1, d).getDay()];
    if (dayName === "Sunday" || isHoliday(iso)) continue;
    const day = days.find((x) => x.day === dayName);
    if (!day) continue;
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const s of day.slots ?? []) {
      const code = normCode(s.subjectCode);
      if (!code) continue;
      const key = `${code}|${s.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = minutes(s.startTime);
      const b = minutes(s.endTime);
      const w = a !== null && b !== null && b - a >= 100 ? 2 : 1;
      counts.set(code, (counts.get(code) ?? 0) + w);
      if (s.subjectName && !names.has(code)) names.set(code, s.subjectName);
      codes.push(code);
    }
    if (codes.length) dates.push({ date: iso, codes });
  }
  return { counts, names, dates };
}

function countFor(map: Map<string, number>, code: string): number {
  const exact = map.get(normCode(code));
  if (exact !== undefined) return exact;
  const b = baseCode(code);
  let n = 0;
  map.forEach((v, k) => {
    if (baseCode(k) === b) n += v;
  });
  return n;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function project(rows: AttendanceRow[], before: Map<string, number>, during: Map<string, number>): Projection[] {
  const T = TARGET / 100;
  return rows.map((r) => {
    const a = countFor(before, r.subjectCode);
    const m = countFor(during, r.subjectCode);
    const present = r.presentCount + a;
    const total = r.totalSessions + a + m;
    const afterPct = total ? round1((present / total) * 100) : null;
    const needAfter = afterPct === null || afterPct >= TARGET ? 0 : Math.ceil((T * total - present) / (1 - T) - 1e-9);
    return {
      code: r.subjectCode,
      name: r.subjectName,
      nowPct: r.totalSessions ? round1((r.presentCount / r.totalSessions) * 100) : null,
      afterPct,
      missed: m,
      attendBefore: a,
      needAfter,
    };
  });
}

export function untracked(rows: AttendanceRow[], during: Map<string, number>): string[] {
  const known = new Set(rows.flatMap((r) => [normCode(r.subjectCode), baseCode(r.subjectCode)]));
  return Array.from(during.keys()).filter((k) => !known.has(k) && !known.has(baseCode(k)));
}
