import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {slotTaughtBy} from "./facultyLegend";
import {sameSection} from "./audience";

// Cancel a class or move it to another room. Only the faculty who teaches that slot (per the timetable) or an admin may.

type Slot = {startTime: string; endTime: string; subjectCode: string; subjectName?: string; faculty?: string; room?: string};
type Timetable = {branch: string; semester: number; section: string; days?: {day: string; slots?: Slot[]}[]};

const squash = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s_\-.]+/g, "");
const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMinutes(time: string): number {
  const m = String(time ?? "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.toUpperCase();
  if (mer === "P" && h < 12) h += 12;
  else if (mer === "A" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

function normSection(branch: unknown, section: unknown): string {
  const b = squash(branch);
  let x = squash(section).replace(/^(SECTION|SEC)/, "");
  if (b && x.startsWith(b)) x = x.slice(b.length);
  return x;
}

/** Same id the app used before, so existing changes keep working. */
function changeId(p: {date: string; branch: string; semester: number; section: string | null; subjectCode: string; startTime: string}): string {
  return [p.date, squash(p.branch), p.semester, normSection(p.branch, p.section) || "ALL", squash(p.subjectCode), squash(p.startTime)].join("_");
}

export const classChangeSet = onCall({region: "asia-south1"}, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore();
  const me = (await db.collection("users").doc(req.auth.uid).get()).data() as {role?: string; isAdmin?: boolean; name?: string} | undefined;
  const isAdmin = me?.role === "admin" || me?.isAdmin === true;
  if (!isAdmin && me?.role !== "faculty") throw new HttpsError("permission-denied", "Only faculty can change classes.");

  const d = (req.data ?? {}) as Record<string, unknown>;
  const action = d.action === "remove" ? "remove" : "save";
  const date = d.date;
  const branch = txt(d.branch, 20);
  const semester = Number(d.semester);
  const section = d.section ? txt(d.section, 20) : null;
  const subjectCode = txt(d.subjectCode, 30);
  const startTime = txt(d.startTime, 10);
  if (!isIso(date) || !branch || !(semester >= 1 && semester <= 10) || !subjectCode || toMinutes(startTime) < 0) {
    throw new HttpsError("invalid-argument", "Class details are incomplete.");
  }
  const id = changeId({date, branch, semester, section, subjectCode, startTime});
  const ref = db.collection("classChanges").doc(id);

  // Find the timetable slot this change is about, and check the caller teaches it.
  const [y, m, dd] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  const tts = (await db.collection("timetable").get()).docs.map((x) => x.data() as Timetable).filter((t) => Number(t.semester) === semester);
  const start = toMinutes(startTime);
  const slot = tts
    .filter((t) => squash(t.branch) === squash(branch) && (!section || sameSection(t.branch, t.section, section)))
    .flatMap((t) => t.days?.find((x) => String(x.day).slice(0, 3).toLowerCase() === wd)?.slots ?? [])
    .find((s) => squash(s.subjectCode) === squash(subjectCode) && toMinutes(s.startTime) === start);

  const existing = await ref.get();
  const teaches = !!slot && !!me?.name && slotTaughtBy(String(slot.faculty ?? ""), me.name);
  if (!isAdmin && !teaches && !(action === "remove" && existing.get("createdBy") === req.auth.uid)) {
    throw new HttpsError("permission-denied", slot ? "Only the faculty who teaches this class can change it." : "This class isn't in the timetable.");
  }

  if (action === "remove") {
    await ref.delete();
    return {ok: true, id};
  }

  const type = d.type === "room" ? "room" : d.type === "cancelled" ? "cancelled" : null;
  if (!type) throw new HttpsError("invalid-argument", "Pick cancel or change room.");
  const newRoom = type === "room" ? txt(d.newRoom, 30) : null;
  if (type === "room" && !newRoom) throw new HttpsError("invalid-argument", "Pick the new room.");
  await ref.set({
    date,
    branch,
    semester,
    section,
    subjectCode,
    subjectName: txt(d.subjectName, 120) || slot?.subjectName || subjectCode,
    startTime,
    endTime: txt(d.endTime, 10) || slot?.endTime || "",
    type,
    oldRoom: txt(d.oldRoom, 30) || slot?.room || null,
    newRoom,
    facultyName: me?.name ?? "",
    createdBy: req.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {ok: true, id};
});
