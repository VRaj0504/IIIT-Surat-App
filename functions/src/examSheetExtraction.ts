// Turns a scanned/typed exam date sheet (PDF or photo) into the exact
// shape the `examSchedules` collection stores: one group per
// branch + semester + exam type, each a sorted list of exams.
//
// Two stages, kept deliberately separate:
//   1. extractRawExamRows() — a vision-model call. It only has to READ the
//      table (expand merged cells, ignore the guidelines, turn dd/mm/yyyy
//      into ISO); it is the one non-deterministic step.
//   2. normalizeExtraction() — plain code that re-validates EVERYTHING the
//      model returned (real calendar dates, real 24h times, known branches,
//      semester 1-8), normalizes course codes, drops duplicates and groups
//      the rows. Nothing the model says reaches Firestore without passing
//      through this, and a human still reviews the result before students
//      see it.
//
// Used by both entry points: the extractExamSchedule callable (portal
// upload) and ingestFacultyEmail (a date sheet attached to an email).

import {geminiJson} from "./gemini";

export const BASE_EXAM_TYPES = ["quiz", "midsem", "endsem", "supplementary"] as const;
type BaseExamType = (typeof BASE_EXAM_TYPES)[number];

// Must match EXAM_TYPES in faculty-upload-web/src/examSheetParser.ts and
// EXAM_TYPE_ORDER in src/firebase/examScheduleService.ts.
export const EXAM_TYPE_LABELS: Record<string, string> = {
  "quiz": "Quiz / Internal",
  "midsem": "Mid Semester",
  "midsem-repeaters": "Mid Semester (Repeaters)",
  "endsem": "End Semester",
  "endsem-repeaters": "End Semester (Repeaters)",
  "supplementary": "Supplementary / Re-exam",
};

export type ExamEntry = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM 24h
  endTime: string; // HH:MM 24h or ""
  subjectCode: string;
  subjectName: string;
  venue: string;
};

export type ExamGroup = {
  branch: "CSE" | "ECE";
  semester: number;
  examType: string; // key of EXAM_TYPE_LABELS
  examTypeLabel: string;
  entries: ExamEntry[];
};

export type NormalizedExtraction = {
  groups: ExamGroup[];
  warnings: string[];
  rowCount: number;
};

const PROMPT = `You are reading an exam date sheet for IIIT Surat (Indian Institute of Information Technology Surat). It may be a scanned PDF or a photo, with one or more tables — typically one table per semester, with the branches (CSE, ECE) as columns and exam dates as rows.

Return ONLY a JSON object, no markdown, in exactly this shape:
{"examType": "midsem", "exams": [{"date": "2026-09-21", "startTime": "09:00", "endTime": "10:00", "branch": "CSE", "semester": 3, "subjectCode": "CS301", "subjectName": "Computer Organization and Architecture", "audience": "regular"}]}

Rules:
- examType is one of: "quiz", "midsem" (mid semester), "endsem" (end semester), "supplementary" (re-exam / backlog). Take it from the sheet's title.
- One object in "exams" per (date, branch, subject). A subject cell that SPANS several branch columns applies to each of those branches — output one object per branch (e.g. a cell spanning both CSE and ECE becomes two objects, same subject).
- If a single cell offers alternatives ("Subject A (CS 514) OR Subject B (EC 513)"), output ONE object: subjectName "Subject A OR Subject B", subjectCode "CS514 / EC513".
- semester is the integer semester: "B.Tech. II (3rd Semester)" -> 3, "B.Tech. III (5th Semester)" -> 5, "B.Tech. IV (7th Semester)" -> 7. If only a year is given, use the semester shown in brackets.
- Times are 24-hour "HH:MM". A time printed as a heading over a whole table ("Time: 09:00 AM to 10:00 AM") applies to every row in that table, UNLESS a row prints its own time (e.g. "26/09/2026  Time: 04:00 PM to 05:00 PM") — then that row uses its own time. 04:00 PM is "16:00".
- Dates are day-first (dd/mm/yyyy) on these sheets. Output ISO "YYYY-MM-DD".
- subjectCode is the code in brackets, without spaces: "(CS 301)" -> "CS301". subjectName is the name without the code.
- audience: "repeaters" when the table or page is titled for Repeaters only; otherwise "regular". A table titled "(Regular & Repeaters)" is "regular".
- Ignore letterheads, guidelines, signatures and stamps. Do NOT invent rows. If a cell is unreadable, skip that row rather than guessing.`;

export async function extractRawExamRows(
  apiKey: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<unknown> {
  // Gemini reads a PDF (including a scan) or an image straight from
  // inline base64 — no page rendering needed on our side.
  return geminiJson({
    apiKey,
    parts: [
      {text: PROMPT},
      {inline_data: {mime_type: mimeType, data: fileBuffer.toString("base64")}},
    ],
    // ~55 rows at roughly 60 tokens each is under 4k; the rest is headroom
    // for a bigger sheet and for any reasoning tokens counted toward the cap.
    maxOutputTokens: 16384,
  });
}

// ---- Stage 2: deterministic validation + grouping --------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    // The model was told ISO, but tolerate the sheet's own dd/mm/yyyy.
    match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!match) return "";
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  return real ? `${y}-${pad(m)}-${pad(d)}` : "";
}

function toHhmm(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const h = Number(match[1]);
  const min = Number(match[2]);
  return h > 23 || min > 59 ? "" : `${pad(h)}:${pad(min)}`;
}

// "CS 301" -> "CS301"; "CS 514 / EC 513" -> "CS514 / EC513".
function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split("/")
    .map((part) => part.replace(/\s+/g, "").toUpperCase())
    .filter(Boolean)
    .join(" / ");
}

function resolveExamType(base: unknown, audience: unknown): string | null {
  if (typeof base !== "string" || !(BASE_EXAM_TYPES as readonly string[]).includes(base)) return null;
  const isRepeaters = typeof audience === "string" && audience.toLowerCase() === "repeaters";
  if (isRepeaters && (base === "midsem" || base === "endsem")) return `${base}-repeaters`;
  return base as BaseExamType;
}

export function normalizeExtraction(raw: unknown, now: Date = new Date()): NormalizedExtraction {
  const warnings: string[] = [];
  const obj = (raw ?? {}) as {examType?: unknown; exams?: unknown};
  const rows = Array.isArray(obj.exams) ? (obj.exams as Record<string, unknown>[]) : [];

  let baseType: unknown = obj.examType;
  if (typeof baseType !== "string" || !(BASE_EXAM_TYPES as readonly string[]).includes(baseType)) {
    if (rows.length > 0) warnings.push("Couldn't tell which exam this is from the sheet's title — defaulted to Mid Semester. Change it below if that's wrong.");
    baseType = "midsem";
  }

  const windowStart = now.getTime() - 60 * 86400000;
  const windowEnd = now.getTime() + 400 * 86400000;

  const groups = new Map<string, ExamGroup>();
  const seen = new Set<string>();
  let accepted = 0;

  rows.forEach((row, i) => {
    const label = `Row ${i + 1}`;
    const branch = typeof row.branch === "string" ? row.branch.trim().toUpperCase() : "";
    const semester = typeof row.semester === "number" ? row.semester : Number(row.semester);
    const date = toIsoDate(row.date);
    const startTime = toHhmm(row.startTime);
    let endTime = toHhmm(row.endTime);
    const subjectCode = normalizeCode(row.subjectCode);
    const subjectName = typeof row.subjectName === "string" ? row.subjectName.replace(/\s+/g, " ").trim() : "";
    const examType = resolveExamType(baseType, row.audience);

    if (branch !== "CSE" && branch !== "ECE") {
      warnings.push(`${label} skipped: branch "${String(row.branch)}" isn't CSE or ECE.`);
      return;
    }
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      warnings.push(`${label} skipped: semester "${String(row.semester)}" isn't 1-8.`);
      return;
    }
    if (!date) {
      warnings.push(`${label} skipped (${subjectCode || subjectName}): couldn't read a valid date.`);
      return;
    }
    if (!startTime) {
      warnings.push(`${label} skipped (${subjectCode || subjectName}): couldn't read a start time.`);
      return;
    }
    if (!subjectCode && !subjectName) {
      warnings.push(`${label} skipped: no subject.`);
      return;
    }
    if (!examType) return; // unreachable: baseType was defaulted above

    if (endTime && endTime <= startTime) {
      warnings.push(`${label} (${subjectCode || subjectName}): end time wasn't after the start time, so it was left blank.`);
      endTime = "";
    }
    const dateMs = Date.parse(`${date}T00:00:00Z`);
    if (dateMs < windowStart || dateMs > windowEnd) {
      warnings.push(`${label} (${subjectCode || subjectName}): date ${date} looks far from today — check it against the sheet.`);
    }

    const key = [branch, semester, examType, date, subjectCode, subjectName.toLowerCase()].join("|");
    if (seen.has(key)) return;
    seen.add(key);

    const groupKey = `${branch}-${semester}-${examType}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {branch, semester, examType, examTypeLabel: EXAM_TYPE_LABELS[examType], entries: []};
      groups.set(groupKey, group);
    }
    group.entries.push({date, startTime, endTime, subjectCode, subjectName, venue: ""});
    accepted++;
  });

  const ordered = Array.from(groups.values())
    .map((g) => ({
      ...g,
      entries: [...g.entries].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    }))
    .sort((a, b) =>
      a.examType.localeCompare(b.examType) || a.semester - b.semester || a.branch.localeCompare(b.branch));

  if (rows.length === 0) warnings.push("No exam rows were found in this file.");
  return {groups: ordered, warnings, rowCount: accepted};
}
