import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {isNoClassDay} from "./holidays";

import {loadExamDocs, isInExamPeriod} from "./examPeriod";

// Students (and faculty) can each pick their own lead time instead of a
// single fixed 3 minutes — this is the fixed menu of choices offered in
// NotificationSettingsScreen.tsx (client side), kept as a short preset
// list rather than free-form minutes so this function only ever has to
// check a handful of target times per run instead of one per possible
// value someone could type in.
const REMINDER_OFFSETS = [3, 5, 7, 10, 15] as const;
const DEFAULT_REMINDER_MINUTES = 3;

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

// A multi-hour lab is often stored as several back-to-back rows (e.g. two
// 1-hour rows for a 2-hour session) rather than one row spanning the
// whole block — that's how the OCR/Excel timetable import naturally
// produces it. Without this merge, the reminder would fire once for the
// real start AND again for every subsequent row, as if a brand-new class
// were beginning each time a student is already sitting in the same lab.
// This collapses any run of same-subject, same-room, contiguous rows
// (one's endTime exactly matches the next's startTime) into a single
// logical session, so only its true start ever triggers a reminder.
// normalize() matters here: without it, two rows that are visibly the
// same class (same subject, same room, back-to-back hours) can still
// fail to match if the raw stored strings differ by something as small
// as a space around a slash ("DN/PG25CS11" vs "DN / PG25CS11") — which
// means a duplicate reminder fires at the second hour, as if a brand-new
// class were starting while the student is still sitting in the same
// lab. Stripping every space for the comparison (never for what's
// actually sent in the notification) catches that too, not just
// repeated whitespace.
function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

// The real bug this fixes (found via the exact same investigation as
// timetable.ts's client-side mergeContiguousSlots): this used to only
// ever compare against merged[merged.length - 1], the single most-
// recently-pushed session. That's fine for one linear sequence, but
// Group 1 and Group 2 run in PARALLEL, so sorted by time they
// interleave — DBMS-Group1 (3-4pm), OOP-Group2 (3-4pm), DBMS-Group1
// (4-5pm), OOP-Group2 (4-5pm). By the time DBMS-Group1's second hour
// comes up, the "last" pushed session is OOP-Group2's, not DBMS-
// Group1's own — so it never saw its own predecessor and always
// started a fresh session. Result: a 2-hour lab fired two separate
// "class in 3 minutes" reminders an hour apart, each showing only its
// own single hour as the time range, instead of one reminder for the
// real 3-5pm block. Fixed by tracking the last entry PER
// (subject/room/group) key independently, so each group's own run of
// hours merges against itself regardless of what interleaves between
// them in sorted order.
function mergeContiguousSessions(slots: TimetableSlot[]): TimetableSlot[] {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: TimetableSlot[] = [];
  const openByKey = new Map<string, TimetableSlot>();

  const keyOf = (s: TimetableSlot) =>
    [normalize(s.subjectCode), normalize(s.room), normalize(s.group ?? "")].join("|");

  for (const slot of sorted) {
    const key = keyOf(slot);
    const open = openByKey.get(key);
    if (open && open.endTime === slot.startTime) {
      open.endTime = slot.endTime; // extend the existing session for this track
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

// students/faculty type shapes shared by notifyForSlot below.
type NotifiableUser = {
  name?: string;
  expoPushToken?: string;
  notificationPreferences?: {classReminders?: boolean; classReminderMinutes?: number};
};

// Cache key is branch+section, not the timetable doc's own id — a
// parallel-group lab produces TWO slot entries at the same time (Group 1
// and Group 2, different room/faculty) but they're still the exact same
// branch+section, so without this cache a group-split period would fire
// the identical "every student in this branch+section" query twice in
// the same run. Caches the in-flight PROMISE, not just the resolved
// result — notifyForSlot calls for the same branch+section are kicked
// off concurrently (tasks.push, not awaited one at a time), so caching
// only after the first one resolves would still let a second concurrent
// call slip through and fire its own duplicate query before the first
// one's result lands.
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
): Promise<void> {
  const title = `Class in ${offsetMinutes} minutes`;
  // Every student in the section gets BOTH a Group 1 and a Group 2
  // reminder when a lab is split — there's no group field on a student's
  // own profile (see resourceService.ts-style section scoping for the
  // closest existing analogue to why), so there's no way to know which
  // one actually applies to a given student and suppress the other.
  // Including the group label at least lets a student tell them apart
  // and recognize their own, instead of two identical-looking pushes.
  const groupLabel = slot.group ? ` (${slot.group})` : "";
  const body = `${slot.subjectName}${groupLabel} • Room ${slot.room} • ${to12Hour(slot.startTime)}–${to12Hour(slot.endTime)}`;

  // Students: branch + section are exact filters; semester can't be
  // queried directly since it's derived from admissionYear, not stored,
  // so it's checked in-memory below — same reasoning as
  // sendAnnouncementPush.ts's targetSection/targetAdmissionYear handling.
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

  // Faculty: matched by expanded name against the slot's initials — see
  // the FACULTY_LEGEND comment at the top of this file for why this is
  // currently a no-op until that map is filled in. facultyUsers is
  // fetched once per function run (see the scheduled handler below), not
  // re-queried per slot — the whole faculty collection is the same
  // regardless of which slot/offset is being checked.
  const expandedNames = expandFacultyInitials(slot.faculty)
    .split(" / ")
    .map((n) => n.trim().toLowerCase());
  const facultyTokens: string[] = [];
  facultyUsers.forEach((faculty) => {
    if (!faculty.expoPushToken || !faculty.name) return;
    if (faculty.notificationPreferences?.classReminders === false) return;
    if (!expandedNames.includes(faculty.name.trim().toLowerCase())) return;
    const wantsMinutes = faculty.notificationPreferences?.classReminderMinutes ?? DEFAULT_REMINDER_MINUTES;
    if (wantsMinutes !== offsetMinutes) return;
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
    //
    // Restricted to 9am-6pm, Mon-Fri: this app's own timetable data
    // never schedules a class before 10:00 or after 17:00 (see
    // scripts/seed-timetable.mjs), and Saturday is never used either
    // (see the comment on WEEKDAYS in TimetableScreen.tsx) — and the
    // longest reminder lead time a person can pick is 15 minutes (see
    // REMINDER_MINUTES_OPTIONS in NotificationSettingsScreen.tsx), so
    // 9am covers even a 10:00 class with room to spare. Outside this
    // window the function used to still run every single minute,
    // 24/7 — including 3am and the semester break — doing a full,
    // unconditional scan of the `timetable` and faculty `users`
    // collections before the holiday/exam-period check further down
    // ever got a chance to bail out. This way it isn't even invoked
    // during the ~15 hours a day (and every weekend) it could never
    // have anything to send.
    schedule: "*/1 9-17 * * 1-5",
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const timetablesSnap = await db.collection("timetable").get();
    // Fetched once per run and reused across every matching slot below —
    // previously this was re-queried from scratch inside notifyForSlot for
    // EVERY matching slot (every offset x every section with a class right
    // then), so a single run with, say, 8 sections all having a 9am start
    // used to issue the same "every faculty member" read 8 separate times.
    const examDocs = await loadExamDocs(db);
    const facultySnap = await db.collection("users").where("role", "==", "faculty").get();
    const facultyUsers = facultySnap.docs.map((doc) => doc.data() as NotifiableUser);
    const studentCache = new Map<string, Promise<FirebaseFirestore.QuerySnapshot>>();
    const tasks: Promise<void>[] = [];

    // One Firestore read of the timetable collection is reused across all
    // 5 offsets — only the in-memory weekday/time comparison repeats,
    // not the read.
    for (const offsetMinutes of REMINDER_OFFSETS) {
      const {weekday, time: reminderTime, dateIso} = istWeekdayAndTimePlusMinutes(offsetMinutes);
      // The weekly timetable has no concept of holidays at all — it's
      // just "every Monday, this section has DBMS at 9am" — so without
      // this check, a public holiday or the Diwali/semester break that
      // happens to land on a normal class day would still fire every
      // reminder for it, exactly as if it were a real class. This is
      // checked per-offset (not once for "today") since the reminder
      // target time is `now + offsetMinutes`, which in a rare
      // near-midnight edge case could land on a different calendar date
      // than right now.
      if (isNoClassDay(dateIso)) continue;

      timetablesSnap.docs.forEach((doc) => {
        const timetable = doc.data() as Timetable;
        if (isInExamPeriod(examDocs, timetable.branch, timetable.semester, dateIso)) return;
        const todayEntry = timetable.days?.find((d) => d.day === weekday);
        if (!todayEntry) return;
        mergeContiguousSessions(todayEntry.slots)
          .filter((slot) => slot.startTime === reminderTime)
          .forEach((slot) =>
            tasks.push(notifyForSlot(db, timetable, slot, offsetMinutes, facultyUsers, studentCache)),
          );
      });
    }

    await Promise.all(tasks);
  },
);
