import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore} from "firebase-admin/firestore";
import {sendExpoPush} from "./expoPush";

function currentSemester(admissionYear: number, now: Date = new Date(), program: 'UG' | 'PG' = 'UG'): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const month = ist.getUTCMonth() + 1;
  const year = ist.getUTCFullYear();
  const isOdd = month >= 7;
  const academicYearIndex = isOdd ? year - admissionYear : year - admissionYear - 1;
  const semester = academicYearIndex * 2 + 1 + (isOdd ? 0 : 1);
  const totalSemesters = program === 'PG' ? 4 : 8;
  return Math.min(Math.max(semester, 1), totalSemesters);
}

export const sendExamSchedulePush = onDocumentWritten(
  "examSchedules/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const schedule = after.data() as {
      branch: string;
      semester: number;
      examType?: string;
      examTypeLabel?: string;
      entries?: unknown[];
    };
    if (!schedule?.branch || !schedule?.semester) return;

    if (String(event.params.docId).endsWith("-repeaters")) return;

    const isUpdate = !!before?.exists;

    const prev = before?.data() as {entries?: unknown[]; sourcePdfUrl?: string | null} | undefined;
    const next = after.data() as {sourcePdfUrl?: string | null};
    if (
      isUpdate &&
      JSON.stringify(prev?.entries) === JSON.stringify(schedule.entries) &&
      (prev?.sourcePdfUrl ?? null) === (next.sourcePdfUrl ?? null)
    ) return;

    let branches = [schedule.branch];
    if (schedule.branch === "CSE") {
      const own = await getFirestore()
        .collection("examSchedules")
        .doc(`MNC-${schedule.semester}-${schedule.examType ?? event.params.docId.split("-").slice(2).join("-")}`)
        .get();
      branches = own.exists ? ["CSE"] : ["CSE", "MNC"];
    }

    const snapshot = await getFirestore()
      .collection("users")
      .where("role", "==", "student")
      .where("branch", "in", branches)
      .get();

    const tokens: string[] = [];
    snapshot.docs.forEach((doc) => {
      const student = doc.data() as {
        admissionYear?: number;
        program?: 'UG' | 'PG';
        expoPushToken?: string;
        notificationPreferences?: {examsAndGrades?: boolean};
      };
      if (!student.expoPushToken || !student.admissionYear) return;
      if (student.notificationPreferences?.examsAndGrades === false) return;
      if (currentSemester(student.admissionYear, undefined, student.program) !== schedule.semester) return;
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
