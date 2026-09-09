import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

// Same reasoning as TimetableScreen.tsx's to12Hour — stored "HH:MM" is
// right for comparing/matching against the current time, wrong for
// putting in front of a person, so only the notification text converts.
function to12Hour(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

// Mirrors src/data/facultyLegend.ts on the client — timetable slots store
// faculty as the initials printed on the official PDFs (e.g. "RRP",
// "DN/PJM" for a two-instructor lab), not full names, so this map is what
// turns those into something matchable against a `users` doc's `name`.
// KEEP THIS IN SYNC with src/data/facultyLegend.ts by hand — functions/
// is a separate TypeScript project with its own build, so it can't import
// straight from src/. Until real initials are filled in here (same as
// that file), no faculty member will match a slot, so this function's
// faculty-side reminders silently send to nobody — the student-side
// reminders work today regardless, since section/branch/semester are
// already exact.
const FACULTY_LEGEND: Record<string, string> = {
  // 'RRP': 'Full Name Here',
};

function expandFacultyInitials(faculty: string): string {
  return faculty
    .split("/")
    .map((part) => FACULTY_LEGEND[part.trim()] ?? part.trim())
    .join(" / ");
}

// Mirrors src/utils/academicInfo.ts's getCurrentSemester — duplicated for
// the same cross-project-import reason as the legend above.
function getCurrentSemester(admissionYear: number, today: Date): number {
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;
  return academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
}

// The reminder needs IST wall-clock time regardless of what timezone the
// function's container happens to run in — timeZone on the schedule
// itself only controls when the function FIRES, not what `new Date()`
// reports inside it, so this reads IST explicitly via Intl rather than
// trusting the container's local time.
function istWeekdayAndTimePlusMinutes(minutesAhead: number): {weekday: string; time: string} {
  const target = new Date(Date.now() + minutesAhead * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(target);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = parts.find((p) => p.type === "hour")!.value.padStart(2, "0");
  const minute = parts.find((p) => p.type === "minute")!.value.padStart(2, "0");
  return {weekday, time: `${hour}:${minute}`};
}

type TimetableSlot = {
  startTime: string;
  subjectCode: string;
  subjectName: string;
  faculty: string;
  room: string;
  endTime: string;
};

type Timetable = {
  branch: string;
  semester: number;
  section: string;
  days: {day: string; slots: TimetableSlot[]}[];
};

// A multi-hour lab is often stored as several back-to-back rows (e.g. two
// 1-hour rows for a 2-hour session) rather than one row spanning the
// whole block — that's how the OCR/Excel timetable import naturally
// produces it. Without this merge, the reminder would fire once for the
// real start AND again for every subsequent row, as if a brand-new class
// were beginning each time a student is already sitting in the same lab.
// This collapses any run of same-subject, same-room, contiguous rows
// (one's endTime exactly matches the next's startTime) into a single
// logical session, so only its true start ever triggers a reminder.
function mergeContiguousSessions(slots: TimetableSlot[]): TimetableSlot[] {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: TimetableSlot[] = [];

  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    const continuesLast =
      last &&
      last.endTime === slot.startTime &&
      last.subjectCode === slot.subjectCode &&
      last.room === slot.room;
    if (continuesLast) {
      last.endTime = slot.endTime; // extend the existing session, don't add a new one
    } else {
      merged.push({...slot});
    }
  }

  return merged;
}

async function pushToTokens(tokens: string[], title: string, body: string): Promise<void> {
  if (tokens.length === 0) return;
  // Same 100-per-request chunking as sendAnnouncementPush.ts, same Expo
  // push endpoint — this reminder is just a different trigger for the
  // identical delivery mechanism already in production.
  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) chunks.push(tokens.slice(i, i + CHUNK_SIZE));

  await Promise.all(
    chunks.map((chunk) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
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
            // Shows as a heads-up banner on both platforms rather than
            // silently landing in the notification tray — the whole
            // point of a 3-minute warning is that it's seen immediately.
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

async function notifyForSlot(db: FirebaseFirestore.Firestore, timetable: Timetable, slot: TimetableSlot): Promise<void> {
  const title = "Class in 3 minutes";
  const body = `${slot.subjectName} • Room ${slot.room} • ${to12Hour(slot.startTime)}–${to12Hour(slot.endTime)}`;

  // Students: branch + section are exact filters; semester can't be
  // queried directly since it's derived from admissionYear, not stored,
  // so it's checked in-memory below — same reasoning as
  // sendAnnouncementPush.ts's targetSection/targetAdmissionYear handling.
  const studentsSnap = await db
    .collection("users")
    .where("role", "==", "student")
    .where("branch", "==", timetable.branch)
    .where("section", "==", timetable.section)
    .get();

  const today = new Date();
  const studentTokens: string[] = [];
  studentsSnap.docs.forEach((doc) => {
    const student = doc.data() as {admissionYear?: number; expoPushToken?: string; notificationPreferences?: {classReminders?: boolean}};
    if (!student.expoPushToken || !student.admissionYear) return;
    if (student.notificationPreferences?.classReminders === false) return;
    if (getCurrentSemester(student.admissionYear, today) !== timetable.semester) return;
    studentTokens.push(student.expoPushToken);
  });

  // Faculty: matched by expanded name against the slot's initials — see
  // the FACULTY_LEGEND comment at the top of this file for why this is
  // currently a no-op until that map is filled in.
  const expandedNames = expandFacultyInitials(slot.faculty)
    .split(" / ")
    .map((n) => n.trim().toLowerCase());
  const facultySnap = await db.collection("users").where("role", "==", "faculty").get();
  const facultyTokens: string[] = [];
  facultySnap.docs.forEach((doc) => {
    const faculty = doc.data() as {name?: string; expoPushToken?: string; notificationPreferences?: {classReminders?: boolean}};
    if (!faculty.expoPushToken || !faculty.name) return;
    if (faculty.notificationPreferences?.classReminders === false) return;
    if (!expandedNames.includes(faculty.name.trim().toLowerCase())) return;
    facultyTokens.push(faculty.expoPushToken);
  });

  await Promise.all([
    pushToTokens(studentTokens, title, body),
    pushToTokens(facultyTokens, title, body),
  ]);
}

export const sendClassReminderPush = onSchedule(
  {
    // Firestore reads here are cheap (one doc per section, once a
    // minute) and the whole point is a tight 3-minute window, so a
    // 1-minute cadence is the coarsest interval that still hits it
    // reliably from a single scheduled run.
    schedule: "every 1 minutes",
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const {weekday, time: reminderTime} = istWeekdayAndTimePlusMinutes(3);

    const timetablesSnap = await db.collection("timetable").get();
    const tasks: Promise<void>[] = [];

    timetablesSnap.docs.forEach((doc) => {
      const timetable = doc.data() as Timetable;
      const todayEntry = timetable.days?.find((d) => d.day === weekday);
      if (!todayEntry) return;
      mergeContiguousSessions(todayEntry.slots)
        .filter((slot) => slot.startTime === reminderTime)
        .forEach((slot) => tasks.push(notifyForSlot(db, timetable, slot)));
    });

    await Promise.all(tasks);
  },
);
