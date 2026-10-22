

const ACADEMIC_YEAR_START_MONTH = 6;

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

export function academicYearOptions(count = 5): string[] {
  const currentStart = academicYearStartFor(new Date());
  const options: string[] = [];
  for (let offset = 1; offset >= -(count - 2); offset--) {
    options.push(formatAcademicYear(currentStart + offset));
  }
  return options;
}

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

  return currentAcademicYear();
}

export function isResourceVisibleThisYear(
  resource: { type: string; academicYear?: string | null; createdAt?: { toDate: () => Date } | null },
  viewerAcademicYear: string = currentAcademicYear(),
): boolean {
  if (resource.type === 'PYQ') return true;
  const year = resourceAcademicYear(resource);
  return year === null || year === viewerAcademicYear;
}

export function examYearOptions(count = 8): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
}

export function batchChoices(now: Date = new Date()): { value: string; label: string }[] {
  const start = academicYearStartFor(now);
  const thisYear = formatAcademicYear(start);
  const nextYear = formatAcademicYear(start + 1);
  return [
    { value: thisYear, label: `This year (${thisYear})` },
    { value: nextYear, label: `Next year (${nextYear})` },
  ];
}
