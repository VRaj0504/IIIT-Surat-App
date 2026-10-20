// One place that knows what an "academic year" means for this college,
// so the resources library can tell one cohort's material apart from the
// next one's. Everything here is pure string/date maths — no Firestore,
// no React — so both the student view and the faculty upload screen can
// share it without either depending on the other.

// The academic year runs July -> June here (odd semester starts in July),
// so anything from July onward belongs to the year that STARTS in that
// calendar year, and Jan-June belongs to the year that started the
// previous calendar year. A resource uploaded in Sept 2026 and one
// uploaded in Feb 2027 are the same cohort's, and this is the line that
// makes that true.
const ACADEMIC_YEAR_START_MONTH = 6; // 0-indexed: 6 = July

// Canonical label, e.g. "2026-27". Stored on the resource doc and shown
// in the UI, so both sides always agree on the exact string.
export function formatAcademicYear(startYear: number): string {
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}

export function academicYearStartFor(date: Date): number {
  return date.getMonth() >= ACADEMIC_YEAR_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;
}

export function academicYearFor(date: Date): string {
  return formatAcademicYear(academicYearStartFor(date));
}

export function currentAcademicYear(): string {
  return academicYearFor(new Date());
}

// Options for the faculty upload dropdown: the current year first (the
// overwhelmingly common case), plus a couple back for someone uploading
// a PYQ from an older sitting, and one ahead for material prepared
// before the new year formally starts.
export function academicYearOptions(count = 5): string[] {
  const currentStart = academicYearStartFor(new Date());
  const options: string[] = [];
  for (let offset = 1; offset >= -(count - 2); offset--) {
    options.push(formatAcademicYear(currentStart + offset));
  }
  return options;
}

// A resource's effective academic year. Resources uploaded BEFORE this
// field existed have no academicYear at all — rather than treating those
// as "always visible" (which would defeat the whole point the moment the
// next cohort arrives) or hiding them outright (which would wipe the
// library today), this derives the year from when the file was actually
// uploaded. That's exactly the cohort it belonged to, so legacy files
// age out on their own with no manual backfill.
export function resourceAcademicYear(resource: {
  academicYear?: string | null;
  createdAt?: { toDate: () => Date } | null;
}): string | null {
  if (resource.academicYear) return resource.academicYear;
  if (resource.createdAt?.toDate) {
    try {
      return academicYearFor(resource.createdAt.toDate());
    } catch {
      return null;
    }
  }
  // Brand-new doc whose serverTimestamp hasn't resolved yet — treat as
  // current rather than null so it doesn't flicker out of the list for
  // the uploader in the moment between write and server ack.
  return currentAcademicYear();
}

// The rule the whole feature turns on.
//
// PYQs deliberately accumulate across cohorts — a four-year-old paper is
// the single most useful thing a junior can have, so year is irrelevant
// to whether they see it. Notes and Slides are the opposite: they're
// this cohort's working material, they go stale, and a junior arriving
// next year should start from a clean shelf rather than inheriting
// hundreds of files from every batch before them.
export function isResourceVisibleThisYear(
  resource: { type: string; academicYear?: string | null; createdAt?: { toDate: () => Date } | null },
  viewerAcademicYear: string = currentAcademicYear(),
): boolean {
  if (resource.type === 'PYQ') return true;
  const year = resourceAcademicYear(resource);
  return year === null || year === viewerAcademicYear;
}

// Calendar years an exam paper might be from, newest first — the current
// year back a handful, since the point of keeping old papers is having
// several sittings to practise on. This is the year the exam was HELD
// (2024), deliberately separate from the academic-year label ("2023-24")
// used for cohorts: a paper is filed by when it was sat, a note by which
// batch it was written for.
export function examYearOptions(count = 8): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
}

// The only two answers that make sense when filing Notes, Slides or an
// Assignment: for the students who are here now, or for the batch that
// starts next. Older years would be pointless — no student would ever
// see them — and a five-year list of "2026-27"-style labels, headed by
// a year that hasn't begun, is exactly what made this field confusing.
// "This year" is listed first and is the default, so in the usual case
// nobody has to think about it at all.
//
// `now` is a parameter only so the July rollover can be tested.
export function batchChoices(now: Date = new Date()): { value: string; label: string }[] {
  const start = academicYearStartFor(now);
  const thisYear = formatAcademicYear(start);
  const nextYear = formatAcademicYear(start + 1);
  return [
    { value: thisYear, label: `This year (${thisYear})` },
    { value: nextYear, label: `Next year (${nextYear})` },
  ];
}
