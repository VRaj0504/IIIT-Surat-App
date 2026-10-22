

export function getCurrentSemester(
  admissionYear: number,
  today: Date = new Date(),
  program: 'UG' | 'PG' = 'UG',
): number {
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;

  const semester = academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
  const totalSemesters = program === 'PG' ? 4 : 8;
  return Math.min(Math.max(semester, 1), totalSemesters);
}