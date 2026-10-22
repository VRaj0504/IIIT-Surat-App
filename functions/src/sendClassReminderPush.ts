import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {isNoClassDay} from "./holidays";
import {loadHolidayOverrides} from "./holidayOverrides";

import {loadExamDocs, isInExamPeriod} from "./examPeriod";
import {expandFaculty, slotTaughtBy} from "./facultyLegend";

const REMINDER_OFFSETS = [3, 5, 7, 10, 15] as const;
const DEFAULT_REMINDER_MINUTES = 3;

function to12Hour(time: string): string {
  const mins = toMinutes(time);
  if (mins < 0) return time;
  const hour = Math.floor(mins / 60);
  const minute = String(mins % 60).padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function toMinutes(time: string): number {
  const match = String(time ?? "")
    .trim()
    .match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  if (h > 23 || m > 59) return -1;
  const mer = match[3]?.toUpperCase();
  if (mer === "P" && h < 12) h += 12;
  else if (mer === "A" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12;
  return h * 60 + m;
}

function sameDay(a: string, b: string): boolean {
  const norm = (s: string) => String(s ?? "").trim().slice(0, 3).toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

function getCurrentSemester(admissionYear: number, today: Date): number {
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod ?
    currentYear - admissionYear :
    currentYear - admissionYear - 1;
  return academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
}

function istWeekdayAndTimePlusMinutes(minutesAhead: number): {weekday: string; time: string; dateIso: string} {
  const target = new Date(Date.now() + minutesAhead * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(target);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = parts.find((p) => p.type === "hour")!.value.padStart(2, "0");
  const minute = parts.find((p) => p.type === "minute")!.value.padStart(2, "0");
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return {weekday, time: `${hour}:${minute}`, dateIso: `${year}-${month}-${day}`};
}

type TimetableSlot = {
  startTime: string;
  subjectCode: string;
  subjectName: string;
  faculty: string;
  room: string;
  endTime: string;
  group?: string;
};

type Timetable = {
  branch: string;
  semester: number;
  section: string;
  days: {day: string; slots: TimetableSlot[]}[];
};

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

function mergeContiguousSessions(slots: TimetableSlot[]): TimetableSlot[] {

  const sorted = [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const merged: TimetableSlot[] = [];
  const openByKey = new Map<string, TimetableSlot>();

  const keyOf = (s: TimetableSlot) =>
    [normalize(s.subjectCode), normalize(s.room), normalize(s.group ?? "")].join("|");

  for (const slot of sorted) {
    const key = keyOf(slot);
    const open = openByKey.get(key);
    if (open && toMinutes(open.endTime) >= 0 && toMinutes(open.endTime) === toMinutes(slot.startTime)) {
      open.endTime = slot.endTime;
    } else {
      const copy = {...slot};
      merged.push(copy);
      openByKey.set(key, copy);
    }
  }

  return merged;
}

async function pushToTokens(tokens: string[], title: string, body: string): Promise<void> {
  if (tokens.length === 0) return;

  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) chunks.push(tokens.slice(i, i + CHUNK_SIZE));

  await Promise.all(
    chunks.map((chunk) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((token) => ({
            to: token,
            title,
            body,
            sound: "default",
            priority: "high",

            channelId: "class-reminders",
          })),
        ),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[sendClassReminderPush] Expo push API call failed:", err);
      }),
    ),
  );
}

type NotifiableUser = {
  name?: string;
  expoPushToken?: string;
  notificationPreferences?: {classReminders?: boolean; classReminderMinutes?: number};
};

async function getStudentsForSection(
  db: FirebaseFirestore.Firestore,
  cache: Map<string, Promise<FirebaseFirestore.QuerySnapshot>>,
  branch: string,
  section: string,
): Promise<FirebaseFirestore.QuerySnapshot> {
  const key = `${branch}|${section}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = db
      .collection("users")
      .where("role", "==", "student")
      .where("branch", "==", branch)
      .where("section", "==", section)
      .get();
    cache.set(key, pending);
  }
  return pending;
}

async function notifyForSlot(
  db: FirebaseFirestore.Firestore,
  timetable: Timetable,
  slot: TimetableSlot,
  offsetMinutes: number,
  facultyUsers: NotifiableUser[],
  studentCache: Map<string, Promise<FirebaseFirestore.QuerySnapshot>>,
  facultyQueue: Map<string, FacultyQueueEntry>,
): Promise<void> {
  const title = `Class in ${offsetMinutes} minutes`;

  const groupLabel = slot.group ? ` (${slot.group})` : "";
  const body = `${slot.subjectName}${groupLabel} • Room ${slot.room} • ${to12Hour(slot.startTime)}–${to12Hour(slot.endTime)}`;

  const studentsSnap = await getStudentsForSection(db, studentCache, timetable.branch, timetable.section);

  const today = new Date();
  const studentTokens: string[] = [];
  studentsSnap.docs.forEach((doc) => {
    const student = doc.data() as {
      admissionYear?: number;
      expoPushToken?: string;
      notificationPreferences?: {classReminders?: boolean; classReminderMinutes?: number};
    };
    if (!student.expoPushToken || !student.admissionYear) return;
    if (student.notificationPreferences?.classReminders === false) return;
    if (getCurrentSemester(student.admissionYear, today) !== timetable.semester) return;
    const wantsMinutes = student.notificationPreferences?.classReminderMinutes ?? DEFAULT_REMINDER_MINUTES;
    if (wantsMinutes !== offsetMinutes) return;
    studentTokens.push(student.expoPushToken);
  });

  facultyUsers.forEach((faculty) => {
    if (!faculty.expoPushToken || !faculty.name) return;
    if (faculty.notificationPreferences?.classReminders === false) return;
    const wantsMinutes = faculty.notificationPreferences?.classReminderMinutes ?? DEFAULT_REMINDER_MINUTES;
    if (wantsMinutes !== offsetMinutes) return;
    if (!slotTaughtBy(slot.faculty, faculty.name)) return;
    const key = `${faculty.expoPushToken}|${offsetMinutes}`;
    let entry = facultyQueue.get(key);
    if (!entry) {
      entry = {token: faculty.expoPushToken, name: faculty.name, offsetMinutes, classes: []};
      facultyQueue.set(key, entry);
    }
    entry.classes.push({timetable, slot});
  });

  await pushToTokens(studentTokens, title, body);
}

type FacultyClass = {timetable: Timetable; slot: TimetableSlot};
type FacultyQueueEntry = {token: string; name: string; offsetMinutes: number; classes: FacultyClass[]};

function classLabel(tt: Timetable): string {
  const section = String(tt.section ?? "").trim();

  const showSection = section && section.toUpperCase() !== String(tt.branch).toUpperCase();
  return `${tt.branch} Sem ${tt.semester}${showSection ? ` ${section}` : ""}`;
}

async function sendFacultyReminders(queue: Map<string, FacultyQueueEntry>): Promise<void> {
  const sends: Promise<void>[] = [];
  queue.forEach((entry) => {

    const groups = new Map<string, FacultyClass[]>();
    for (const c of entry.classes) {
      const key = [c.slot.subjectCode || c.slot.subjectName, c.slot.room, c.slot.group ?? ""]
        .map((s) => String(s ?? "").replace(/\s+/g, "").toUpperCase())
        .join("|");
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const lines = Array.from(groups.values()).map((cs) => {
      const s = cs[0].slot;
      const subject = s.subjectCode ? `${s.subjectName || s.subjectCode} (${s.subjectCode})` : s.subjectName;
      const classes = Array.from(new Set(cs.map((c) => classLabel(c.timetable)))).join(" + ");
      const group = s.group ? ` · ${s.group}` : "";
      const others = expandFaculty(s.faculty)
        .split(" / ")
        .filter((n) => n && !slotTaughtBy(n, entry.name));
      const withWhom = others.length > 0 ? ` · with ${others.join(", ")}` : "";
      return `${subject} — ${classes}${group} · ${to12Hour(s.startTime)}–${to12Hour(s.endTime)}${withWhom}`;
    });
    const rooms = Array.from(new Set(entry.classes.map((c) => String(c.slot.room ?? "").trim()).filter(Boolean)));
    const where = rooms.length > 0 ? ` — go to ${rooms.join(" / ")}` : "";
    const title = `Your class in ${entry.offsetMinutes} min${where}`;
    sends.push(pushToTokens([entry.token], title, lines.join("\n")));
  });
  await Promise.all(sends);
}

export const sendClassReminderPush = onSchedule(
  {

    schedule: "*/1 8-17 * * 1-5",

    timeZone: "Asia/Kolkata",
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const timetablesSnap = await db.collection("timetable").get();

    const examDocs = await loadExamDocs(db);
    const holidayOverrides = await loadHolidayOverrides(db);
    const facultySnap = await db.collection("users").where("role", "==", "faculty").get();
    const facultyUsers = facultySnap.docs.map((doc) => doc.data() as NotifiableUser);
    const studentCache = new Map<string, Promise<FirebaseFirestore.QuerySnapshot>>();
    const facultyQueue = new Map<string, FacultyQueueEntry>();
    const tasks: Promise<void>[] = [];

    for (const offsetMinutes of REMINDER_OFFSETS) {
      const {weekday, time: reminderTime, dateIso} = istWeekdayAndTimePlusMinutes(offsetMinutes);
      const reminderMinutes = toMinutes(reminderTime);

      if (isNoClassDay(dateIso) || holidayOverrides.has(dateIso)) continue;

      timetablesSnap.docs.forEach((doc) => {
        const timetable = doc.data() as Timetable;
        if (isInExamPeriod(examDocs, timetable.branch, timetable.semester, dateIso)) return;
        const todayEntry = timetable.days?.find((d) => sameDay(d.day, weekday));
        if (!todayEntry) return;
        mergeContiguousSessions(todayEntry.slots ?? [])
          .filter((slot) => toMinutes(slot.startTime) === reminderMinutes)
          .forEach((slot) =>
            tasks.push(notifyForSlot(db, timetable, slot, offsetMinutes, facultyUsers, studentCache, facultyQueue)),
          );
      });
    }

    await Promise.all(tasks);

    await sendFacultyReminders(facultyQueue);
  },
);
