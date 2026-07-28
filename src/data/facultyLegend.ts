// Maps the faculty initials printed on the official timetable PDFs to full
// names for display. Fill in real names as you confirm them — anything not
// in this map is shown as-is (the initials), so missing entries degrade
// gracefully instead of breaking the screen.
//
// Initials seen so far in scripts/seed-timetable.mjs: RRP, TG, RN, DN, PJM,
// MR, HS-F1, HS-F2, plus teaching-assistant codes like PG25CS07 (left
// unexpanded on purpose — TA names change too often to hardcode).
const FACULTY_LEGEND: Record<string, string> = {
  // 'RRP': 'Full Name Here',
  // 'TG': 'Full Name Here',
  // 'RN': 'Full Name Here',
  // 'DN': 'Full Name Here',
  // 'PJM': 'Full Name Here',
  // 'MR': 'Full Name Here',
  // 'HS-F1': 'Full Name Here',
  // 'HS-F2': 'Full Name Here',
};

// Slots with two people (lab sessions) store faculty as "DN/PJM" — expand
// each half independently and rejoin, so a partially-filled legend still
// helps.
export function expandFaculty(faculty: string): string {
  return faculty
    .split('/')
    .map((part) => FACULTY_LEGEND[part.trim()] ?? part.trim())
    .join(' / ');
}
