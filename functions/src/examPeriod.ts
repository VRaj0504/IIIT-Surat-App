

export type ExamDocEntry = {
  date: string;
  startTime: string;
  endTime?: string;
  subjectCode?: string;
  subjectName?: string;
};

export type ExamDoc = {
  branch: string;
  semester: number;
  examType: string;
  examTypeLabel?: string;
  entries: ExamDocEntry[];
};

const CLASS_SUSPENDING_TYPES = ["midsem", "endsem"];

export function to12Hour(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

export function currentSemester(
  admissionYear: number,
  now: Date = new Date(),
  program: 'UG' | 'PG' = 'UG',
): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const month = ist.getUTCMonth() + 1;
  const year = ist.getUTCFullYear();
  const isOdd = month >= 7;
  const academicYearIndex = isOdd ? year - admissionYear : year - admissionYear - 1;
  const semester = academicYearIndex * 2 + 1 + (isOdd ? 0 : 1);
  const totalSemesters = program === 'PG' ? 4 : 8;
  return Math.min(Math.max(semester, 1), totalSemesters);
}

export function sheetBranch(branch: string): string {
  return branch.toUpperCase() === "MNC" ? "CSE" : branch;
}

export function sheetBranchFor(docs: ExamDoc[], branch: string, semester: number): string {
  if (branch.toUpperCase() !== "MNC") return branch;
  return docs.some((d) => d.branch === "MNC" && d.semester === semester) ? "MNC" : "CSE";
}

function windowOf(doc: ExamDoc): {start: string; end: string} | null {
  const dates = (doc.entries ?? []).map((e) => e.date).filter(Boolean).sort();
  return dates.length ? {start: dates[0], end: dates[dates.length - 1]} : null;
}

function activeSheet(docs: ExamDoc[], branch: string, semester: number, dateIso: string): ExamDoc | null {
  return (
    docs.find((d) => {
      if (d.branch !== branch || d.semester !== semester || !CLASS_SUSPENDING_TYPES.includes(d.examType)) return false;
      const w = windowOf(d);
      return !!w && dateIso >= w.start && dateIso <= w.end;
    }) ?? null
  );
}

export function isInExamPeriod(docs: ExamDoc[], branch: string, semester: number, dateIso: string): boolean {
  return activeSheet(docs, branch, semester, dateIso) !== null;
}

export function examDayMessage(
  docs: ExamDoc[],
  branch: string,
  semester: number,
  dateIso: string,
): {title: string; body: string} | null {
  const sheet = activeSheet(docs, branch, semester, dateIso);
  if (!sheet) return null;

  const today = sheet.entries
    .filter((e) => e.date === dateIso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const label = sheet.examTypeLabel ?? "Exam";

  if (today.length === 0) {
    return {
      title: "No exam today",
      body: `You're in the ${label.toLowerCase()} period, but nothing's scheduled for you today. No regular classes either.`,
    };
  }
  const subjectNames = today.map((e) => e.subjectName || e.subjectCode).join(", ");
  const list = today.map((e) => `${e.subjectName || e.subjectCode} at ${to12Hour(e.startTime)}`).join("; ");
  return {
    title: `Exam today: ${subjectNames}`,
    body: `${list}. No regular classes today.`,
  };
}

let cache: {at: number; docs: ExamDoc[]} | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function loadExamDocs(db: FirebaseFirestore.Firestore): Promise<ExamDoc[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.docs;
  const snap = await db.collection("examSchedules").where("examType", "in", CLASS_SUSPENDING_TYPES).get();
  const docs = snap.docs.map((d) => d.data() as ExamDoc);
  cache = {at: Date.now(), docs};
  return docs;
}
