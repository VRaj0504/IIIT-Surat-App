import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";



const FACULTY_LEGEND: Record<string, string> = {
  // 'RRP': 'Full Name Here',
  "K.D.": "Kaustubh Dhondge",
  "R.K.": "Ritesh Kumar",
  "RRP": "Reema Patel",
  "P.S.": "Pradeep Singh",
  "R.N": "Rachit Nimavat",
  "D.N": "Nidhi Desai",
  "PJM": "Prathana Jagat Mehta",
  "N B" : " Nayan Behra",
  "A.D" : "Abisek Dahal",
  "D.R." : "Diksha Rangwani",
  "T.G." : "Trupti Gondaliya",
  "K.Y." : "Khamosh Yadav",
  "SS": "Sudeep Sharma",
  "SVR" : "Sivavenkateswara Rao V.",
  "VAP" : "Venkata Annapura Chavali",
  "H.G." : "Hemant Goklani",
  "T.D." : "Tanmay Dubey",
  "S.M." : "Shikha Murya",
  "L.C." : "Lokendra Chaouhan",
  "AN" : "Neelima Agarwal",
  "MR" : "Manish Rai",
  "DP" :" Dhiraj K. Patel",
  "RM" : "Rahul D. Mishra",
  "RK" : "Rahul K Patel",
  "SR" : " Sejal K Rathod",
  "AT" :"Anandatheertan Srinivasan",
  "BP" : " Bikas Patra",
  "ND" : "Nishad Deshpande",
  "APS" : "Anand Pratap Singh",
  "AP" : "Arti Patel",
  "VP" : "Vijay K Patel"
};

function expandFacultyInitials(faculty: string): string {
  return faculty
    .split("/")
    .map((part) => FACULTY_LEGEND[part.trim()] ?? part.trim())
    .join(" / ");
}


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
};

type Timetable = {
  branch: string;
  semester: number;
  section: string;
  days: {day: string; slots: TimetableSlot[]}[];
};

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
  const body = `${slot.subjectName} • Room ${slot.room}`;

  const studentsSnap = await db
    .collection("users")
    .where("role", "==", "student")
    .where("branch", "==", timetable.branch)
    .where("section", "==", timetable.section)
    .get();

  const today = new Date();
  const studentTokens: string[] = [];
  studentsSnap.docs.forEach((doc) => {
    const student = doc.data() as {admissionYear?: number; expoPushToken?: string};
    if (!student.expoPushToken || !student.admissionYear) return;
    if (getCurrentSemester(student.admissionYear, today) !== timetable.semester) return;
    studentTokens.push(student.expoPushToken);
  });

  const expandedNames = expandFacultyInitials(slot.faculty)
    .split(" / ")
    .map((n) => n.trim().toLowerCase());
  const facultySnap = await db.collection("users").where("role", "==", "faculty").get();
  const facultyTokens: string[] = [];
  facultySnap.docs.forEach((doc) => {
    const faculty = doc.data() as {name?: string; expoPushToken?: string};
    if (!faculty.expoPushToken || !faculty.name) return;
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
      todayEntry.slots
        .filter((slot) => slot.startTime === reminderTime)
        .forEach((slot) => tasks.push(notifyForSlot(db, timetable, slot)));
    });

    await Promise.all(tasks);
  },
);