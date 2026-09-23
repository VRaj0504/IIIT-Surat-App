import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

// Server copy of src/utils/academicInfo.ts's getCurrentSemester — odd
// semesters start in July, even ones in January. Evaluated in IST so a
// student isn't moved to the next semester up to 5.5 hours early/late
// around the 1 July / 1 January boundary. Keep the two in step by hand.
function currentSemester(admissionYear: number, now: Date = new Date()): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const month = ist.getUTCMonth() + 1;
  const year = ist.getUTCFullYear();
  const isOdd = month >= 7;
  const academicYearIndex = isOdd ? year - admissionYear : year - admissionYear - 1;
  return academicYearIndex * 2 + 1 + (isOdd ? 0 : 1);
}

// Fires when a date sheet is first published AND when it's corrected —
// but stays quiet if a faculty member just re-saves the same rows, so a
// no-op save never pings a whole semester.
export const sendExamSchedulePush = onDocumentWritten(
  "examSchedules/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // a removed date sheet — nothing to announce
    const before = event.data?.before;
    const schedule = after.data() as {
      branch: string;
      semester: number;
      examTypeLabel?: string;
      entries?: unknown[];
    };
    if (!schedule?.branch || !schedule?.semester) return;

    // Repeater sheets are for a small subset of students the app has no
    // way to identify — pushing one to the whole semester would tell
    // ~95% of them about an exam that isn't theirs. They still appear
    // in the app under their own tab.
    if (String(event.params.docId).endsWith("-repeaters")) return;

    const isUpdate = !!before?.exists;
    if (isUpdate && JSON.stringify(before?.data()?.entries) === JSON.stringify(schedule.entries)) return;

    // MNC students read the CSE sheet (same rule as the timetable).
    const branches = schedule.branch === "CSE" ? ["CSE", "MNC"] : [schedule.branch];

    const snapshot = await getFirestore()
      .collection("users")
      .where("role", "==", "student")
      .where("branch", "in", branches)
      .get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        admissionYear?: number;
        expoPushToken?: string;
        notificationPreferences?: {examsAndGrades?: boolean};
      };
      if (!student.expoPushToken || !student.admissionYear) return;
      if (student.notificationPreferences?.examsAndGrades === false) return;
      if (currentSemester(student.admissionYear) !== schedule.semester) return;
      tokens.push(student.expoPushToken);
    });

    const label = schedule.examTypeLabel ?? "Exam";
    await sendExpoPush(
      tokens,
      `${label} date sheet ${isUpdate ? "updated" : "published"}`,
      `${schedule.branch} Semester ${schedule.semester} — check your exam dates.`,
      "sendExamSchedulePush",
    );
  },
);
