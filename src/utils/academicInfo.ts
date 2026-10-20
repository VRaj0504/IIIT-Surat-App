// Given a student's admission year, works out which semester they're
// currently in. IIIT Surat's odd semesters (1,3,5,7) start around July;
// even semesters (2,4,6,8) start around January.
//
// `program` distinguishes a 4-year UG student (8 semesters total) from
// a 2-year PG/MTech student (4 semesters total) — the month-based
// odd/even logic is identical for both, only the total length differs.
// Capped at the program's real length rather than left to climb past
// it forever: without the cap, a UG student well past graduation (no
// admissionYear cleanup job exists yet) would show "semester 11" or
// higher, which is never a real, useful semester to show anyone.
export function getCurrentSemester(
  admissionYear: number,
  today: Date = new Date(),
  program: 'UG' | 'PG' = 'UG',
): number {
  const currentMonth = today.getMonth() + 1; // JS months are 0-indexed
  const currentYear = today.getFullYear();

  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;

  const semester = academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
  const totalSemesters = program === 'PG' ? 4 : 8;
  return Math.min(Math.max(semester, 1), totalSemesters);
}