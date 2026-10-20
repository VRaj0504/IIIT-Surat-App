// Server-side copy of src/data/facultyLegend.ts — functions/ is a separate
// TypeScript project and cannot import from src/. KEEP THE MAP IN SYNC BY HAND.

export const FACULTY_LEGEND: Record<string, string> = {
  "K.D.": "Kaustubh Dhondge",
  "R.K.": "Ritesh Kumar",
  "RRP": "Reema Patel",
  "P.S.": "Pradeep Singh",
  "R.N": "Rachit Nimavat",
  "D.N": "Nidhi Desai",
  "PJM": "Prathana Jagat Mehta",
  "N B": " Nayan Behra",
  "A.D": "Abisek Dahal",
  "D.R.": "Diksha Rangwani",
  "T.G.": "Trupti Gondaliya",
  "K.Y.": "Khamosh Yadav",
  "SS": "Sudeep Sharma",
  "SVR": "Sivavenkateswara Rao V.",
  "VAP": "Venkata Annapura Chavali",
  "H.G.": "Hemant Goklani",
  "T.D.": "Tanmay Dubey",
  "S.M.": "Shikha Murya",
  "L.C.": "Lokendra Chaouhan",
  "AN": "Neelima Agarwal",
  "MR": "Manish Rai",
  "DP": " Dhiraj K. Patel",
  "RM": "Rahul D. Mishra",
  "RK": "Rahul K Patel",
  "SR": " Sejal K Rathod",
  "AT": "Anandatheertan Srinivasan",
  "BP": " Bikas Patra",
  "ND": "Nishad Deshpande",
  "APS": "Anand Pratap Singh",
  "AP": "Aarti Patle",
  "VP": "Vijay K Patel",
};

// The keys above are typed with dots/spaces ("R.N", "D.N", "T.G.", "N B")
// but the timetables store bare initials ("RN", "DN", "TG", "NB"), so an
// exact lookup missed most faculty — their classes never showed in their
// own timetable and they never got class reminders. Lookup is now:
// exact key first (so "RK" -> Rahul K Patel and "R.K." -> Ritesh Kumar
// stay distinct), then the key with dots/spaces/hyphens stripped.
// KEEP IN SYNC with src/data/facultyLegend.ts.
const initialsKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const BY_EXACT = new Map<string, string>();
const BY_LOOSE = new Map<string, string>();
for (const [k, v] of Object.entries(FACULTY_LEGEND)) {
  const name = v.trim();
  BY_EXACT.set(k.trim().toUpperCase(), name);
  const loose = initialsKey(k);
  if (!BY_LOOSE.has(loose)) BY_LOOSE.set(loose, name);
}

export function lookupFacultyInitials(initials: string): string | undefined {
  const t = initials.trim();
  if (!t) return undefined;
  return BY_EXACT.get(t.toUpperCase()) ?? BY_LOOSE.get(initialsKey(t));
}

// "DN/PJM", "DN, PJM", "DN & PJM" -> ["DN", "PJM"]
export function splitFaculty(faculty: string): string[] {
  return String(faculty ?? "")
    .split(/[/,&;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function expandFaculty(faculty: string): string {
  return splitFaculty(faculty)
    .map((part) => lookupFacultyInitials(part) ?? part)
    .join(" / ");
}

// For comparing a profile name against a legend name: ignores case,
// "Dr."/"Prof." prefixes, dots and extra spaces ("Dr. Reema  Patel" ==
// "reema patel").
export function facultyNameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// True if `facultyName` (a profile"s name) is one of the people teaching
// a slot whose faculty field is `slotFaculty`.
export function slotTaughtBy(slotFaculty: string, facultyName: string): boolean {
  const target = facultyNameKey(facultyName);
  if (!target) return false;
  return splitFaculty(slotFaculty).some(
    (part) => facultyNameKey(lookupFacultyInitials(part) ?? part) === target,
  );
}
