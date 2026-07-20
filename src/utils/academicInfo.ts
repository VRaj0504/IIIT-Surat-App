// Given a student's admission year, works out which semester they're
// currently in. IIIT Surat's odd semesters (1,3,5,7) start around July;
// even semesters (2,4,6,8) start around January.
export function getCurrentSemester(admissionYear: number, today: Date = new Date()): number {
  const currentMonth = today.getMonth() + 1; // JS months are 0-indexed
  const currentYear = today.getFullYear();

  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;

  return academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
}